import { copyFile, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { DSTConfig } from "../config.js";
import { extractArchive, listArchiveEntries } from "./archive.js";
import { ensureClusterFiles } from "./clusterScaffold.js";
import { clusterDir, shardDir } from "./paths.js";

/**
 * Importer: นำ cluster (world) จากภายนอกเข้ามาทับ cluster ปัจจุบัน — secure by default
 *
 * โมเดล: single operator (เชื่อถือได้) แต่ยังกัน archive ที่พัง/อันตรายไม่ให้:
 *  - หลุดออกนอก cluster dir (path traversal / symlink)
 *  - ทับไฟล์ของ manager เอง (apply เฉพาะ path ใน whitelist เท่านั้น)
 *  - ทำดิสก์เต็ม (cap จำนวนไฟล์ + ขนาด uncompressed)
 *  - เอา cluster_token.txt ของคนอื่นปนเข้ามา (ไม่อยู่ใน whitelist)
 *
 * โลกจริงอยู่ใน <Shard>/save/ → ต้อง copy save มาด้วยถึงจะได้ world เดิม
 * (mode "no-mods" ตัด Lua ที่รันได้ทิ้ง; "full" เอามาด้วยพร้อม warning)
 */

export type ImportMode = "full" | "no-mods";
export interface ImportOptions {
  mode: ImportMode;
  /** ลบ save/ หลัง copy → ให้ DST regen โลกใหม่ตามกติกาที่ import มา */
  regenerate: boolean;
}
export type ImportSource = { kind: "archive"; path: string } | { kind: "folder"; path: string };

export interface ImportResult {
  applied: number;
  skipped: number;
  shards: string[];
  warnings: string[];
}

export interface ImportHooks {
  log: (line: string) => void;
  progress: (pct: number | null, phase: string | null) => void;
}

// ── limits / patterns ────────────────────────────────────────────────────
const MAX_FILES = 200_000;
const MAX_UNCOMPRESSED = 16 * 1024 * 1024 * 1024; // 16 GB
const MAX_PATH_LEN = 240;
const SHARD_RE = /^[A-Za-z0-9_]+$/;
const BLOCKED_EXT = /\.(exe|dll|bat|cmd|ps1|sh|com|scr|msi|vbs)$/i;
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// อักขระต้องห้ามในชื่อไฟล์ Windows
const BAD_CHARS = /[<>:"|?*]/;

/**
 * path ภายใน archive ปลอดภัยไหม (กัน Zip Slip): ปฏิเสธ absolute, drive letter,
 * "..", segment ว่าง, reserved name, อักขระต้องห้าม, ยาวเกิน
 */
export function isSafeRelPath(name: string): boolean {
  const norm = name.replace(/\\/g, "/").replace(/\/+$/, ""); // ตัด trailing slash ของ dir entry
  if (norm === "" || norm.length > MAX_PATH_LEN) return false;
  if (norm.startsWith("/")) return false; // leading slash = absolute
  if (/^[A-Za-z]:/.test(norm)) return false; // drive letter
  for (const seg of norm.split("/")) {
    if (seg === "" || seg === "." || seg === "..") return false;
    if (BAD_CHARS.test(seg)) return false;
    if (WIN_RESERVED.test((seg.split(".")[0] ?? ""))) return false;
  }
  return true;
}

/** ตัดสินว่า relPath (ไฟล์) ควร apply ไหมตาม whitelist + mode */
function classify(relPath: string, mode: ImportMode): boolean {
  const p = relPath.replace(/\\/g, "/");
  const segs = p.split("/");

  if (BLOCKED_EXT.test(p)) return false;

  if (segs.length === 1) {
    if (p === "cluster.ini") return true;
    if (p === "adminlist.txt" || p === "whitelist.txt" || p === "blocklist.txt") return true;
    return false; // รวมถึง cluster_token.txt → ไม่เอาเด็ดขาด
  }

  const shard = segs[0] ?? "";
  if (shard === "mods" || !SHARD_RE.test(shard)) return false;
  const rest = segs.slice(1);

  if (rest.length === 1 && rest[0] === "server.ini") return true;
  if (rest[0] === "save") return true; // <Shard>/save/**
  if (rest.length === 1 && (rest[0] === "modoverrides.lua" || rest[0] === "worldgenoverride.lua")) {
    return mode === "full";
  }
  return false;
}

/** หา root ของ cluster (โฟลเดอร์ที่มี cluster.ini) — รองรับ archive ที่ห่อด้วยโฟลเดอร์ชั้นเดียว */
async function findClusterRoot(dir: string): Promise<string | null> {
  if (existsSync(join(dir, "cluster.ini"))) return dir;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && existsSync(join(dir, e.name, "cluster.ini"))) return join(dir, e.name);
  }
  return null;
}

interface WalkFile {
  abs: string;
  rel: string;
}

/** เดินไฟล์ทั้งหมดใต้ root; ปฏิเสธ symlink/special (กันหลุดออกนอก root ตอนอ่าน) */
async function walkFiles(root: string): Promise<{ files: WalkFile[]; totalSize: number }> {
  const files: WalkFile[] = [];
  let totalSize = 0;

  async function recurse(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      const st = await lstat(abs);
      if (st.isSymbolicLink()) throw new Error(`rejected symlink in source: ${relative(root, abs)}`);
      if (st.isDirectory()) {
        await recurse(abs);
      } else if (st.isFile()) {
        files.push({ abs, rel: relative(root, abs).replace(/\\/g, "/") });
        totalSize += st.size;
        if (files.length > MAX_FILES) throw new Error(`too many files (> ${MAX_FILES})`);
        if (totalSize > MAX_UNCOMPRESSED) throw new Error("source too large (uncompressed cap exceeded)");
      } else {
        throw new Error(`rejected special file in source: ${relative(root, abs)}`);
      }
    }
  }

  await recurse(root);
  return { files, totalSize };
}

/** pre-flight: ตรวจชื่อ entry ทุกตัวก่อน "แตกไฟล์" — เจอ entry อันตรายตัวเดียวก็ abort */
async function validateArchiveEntries(archivePath: string): Promise<void> {
  const entries = await listArchiveEntries(archivePath);
  if (entries.length > MAX_FILES) throw new Error(`archive has too many entries (> ${MAX_FILES})`);
  let sum = 0;
  for (const e of entries) {
    if (!isSafeRelPath(e.name)) throw new Error(`unsafe path in archive: ${e.name}`);
    sum += e.size;
  }
  if (sum > MAX_UNCOMPRESSED) throw new Error("archive too large (uncompressed cap exceeded)");
}

/**
 * import cluster เข้าทับ cluster ปัจจุบัน
 *  - archive: validate รายชื่อ → แตกลง stagingDir → ใช้เป็น source
 *  - folder : ใช้ path ตรง ๆ เป็น source (ไม่แตกไฟล์)
 * apply เฉพาะไฟล์ใน whitelist; regenerate → ลบ save/ ให้ regen
 *
 * stagingDir: โฟลเดอร์ชั่วคราวว่าง ๆ ที่ caller เตรียม + ลบทิ้งหลังเสร็จ
 */
export async function importCluster(
  dst: DSTConfig,
  source: ImportSource,
  opts: ImportOptions,
  stagingDir: string,
  hooks: ImportHooks,
): Promise<ImportResult> {
  const warnings: string[] = [];

  // 1) เตรียม source root
  let srcRoot: string;
  if (source.kind === "archive") {
    hooks.progress(null, "validating");
    hooks.log("validating archive entries...");
    await validateArchiveEntries(source.path);
    hooks.progress(null, "extracting");
    hooks.log("extracting archive...");
    await mkdir(stagingDir, { recursive: true });
    await extractArchive(source.path, stagingDir);
    const root = await findClusterRoot(stagingDir);
    if (!root) throw new Error("cluster.ini not found in archive");
    srcRoot = root;
  } else {
    if (!existsSync(source.path)) throw new Error(`folder not found: ${source.path}`);
    const root = await findClusterRoot(source.path);
    if (!root) throw new Error("cluster.ini not found in folder");
    srcRoot = root;
  }

  // 2) เดินไฟล์ + validate (symlink/special/size) แล้ว classify
  hooks.progress(null, "scanning");
  hooks.log("scanning source...");
  const { files } = await walkFiles(srcRoot);

  const applyList: WalkFile[] = [];
  let skipped = 0;
  for (const f of files) {
    if (classify(f.rel, opts.mode)) applyList.push(f);
    else skipped++;
  }

  // 3) ตรวจความครบ: ต้องมี cluster.ini + (ถ้าไม่ regen) อย่างน้อย 1 shard ที่มี save/
  if (!applyList.some((f) => f.rel === "cluster.ini")) throw new Error("invalid cluster: missing cluster.ini");
  const shards = [
    ...new Set(applyList.map((f) => f.rel.split("/")).filter((s) => s.length > 1).map((s) => s[0] as string)),
  ];
  const shardsWithSave = [
    ...new Set(applyList.filter((f) => f.rel.includes("/save/")).map((f) => f.rel.split("/")[0] as string)),
  ];
  if (!opts.regenerate && shardsWithSave.length === 0) {
    throw new Error("no save data found (use Regenerate to start a fresh world from these settings)");
  }
  if (
    opts.mode === "full" &&
    applyList.some((f) => f.rel.endsWith("modoverrides.lua") || f.rel.endsWith("worldgenoverride.lua"))
  ) {
    warnings.push("Full mode: imported modoverrides/worldgenoverride Lua will run on this server");
  }

  // 4) apply by allow-list → copy ลง clusterDir
  const target = clusterDir(dst);
  await mkdir(target, { recursive: true });
  hooks.log(`applying ${applyList.length} file(s) (skipped ${skipped})...`);
  for (let i = 0; i < applyList.length; i++) {
    const f = applyList[i]!;
    const dest = join(target, f.rel);
    await mkdir(join(dest, ".."), { recursive: true });
    await copyFile(f.abs, dest);
    if (i % 200 === 0 || i === applyList.length - 1) {
      hooks.progress(applyList.length ? ((i + 1) / applyList.length) * 100 : 100, "copying");
    }
  }

  // 5) regenerate → ลบ save/ ของแต่ละ shard ใน target ให้ DST สร้างใหม่
  if (opts.regenerate) {
    for (const shard of shards) {
      const save = join(shardDir(dst, shard), "save");
      if (existsSync(save)) {
        await rm(save, { recursive: true, force: true });
        hooks.log(`regenerate: removed ${shard}/save`);
      }
    }
    warnings.push("Regenerate: imported saves were dropped — DST will generate a new world");
  }

  // 6) เติม server.ini ที่ขาด (กัน shard boot ไม่ได้)
  ensureClusterFiles(dst, shards.length ? shards : ["Master"]);

  hooks.progress(100, null);
  return { applied: applyList.length, skipped, shards, warnings };
}
