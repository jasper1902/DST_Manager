import { spawn } from "node:child_process";
import { basename, dirname } from "node:path";

/**
 * แตก/อ่านรายการ archive แบบ format-aware (ใช้โดย importer)
 *
 * - .zip   : Windows → PowerShell (Expand-Archive / System.IO.Compression); *nix → bsdtar/unzip
 * - .tar.gz/.tgz : `tar` ที่ติดมากับ OS
 *
 * หมายเหตุ bug ที่เคยเจอ (กันพลาดซ้ำ):
 *  - `tar` ใน PATH อาจเป็น GNU tar (ของ Git) ที่อ่าน zip ไม่ได้ → zip บน Windows ใช้ PowerShell
 *  - bsdtar ตีความ path ที่มี drive letter ใน -f เป็น remote host → ส่ง basename + cwd แทน
 */

export type ArchiveKind = "zip" | "tgz";

/** ระบุชนิด archive จากนามสกุล (รองรับ .zip / .tar.gz / .tgz) — คืน null ถ้าไม่รู้จัก */
export function archiveKind(file: string): ArchiveKind | null {
  const f = file.toLowerCase();
  if (f.endsWith(".zip")) return "zip";
  if (f.endsWith(".tar.gz") || f.endsWith(".tgz")) return "tgz";
  return null;
}

export interface ArchiveEntry {
  /** path ภายใน archive (normalize เป็น "/" แล้ว) */
  name: string;
  /** ขนาด uncompressed (bytes); 0 = ไม่ทราบ (เช่น tar list ไม่ให้ขนาด) */
  size: number;
}

const isWin = process.platform === "win32";

/** escape สำหรับใส่ใน single-quoted PowerShell string */
function ps(s: string): string {
  return s.replace(/'/g, "''");
}

function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * อ่านรายชื่อ entry (+ ขนาดถ้ามี) โดย "ไม่แตกไฟล์" — ใช้ pre-flight validate ก่อนแตกจริง
 * zip ให้ขนาด uncompressed ได้, tar list ให้แค่ชื่อ (size = 0)
 */
export async function listArchiveEntries(file: string): Promise<ArchiveEntry[]> {
  const kind = archiveKind(file);
  if (!kind) throw new Error(`unsupported archive type: ${file}`);

  if (kind === "zip" && isWin) {
    // enumerate ZipArchive เพื่อให้ได้ทั้งชื่อและขนาด uncompressed (กัน zip bomb)
    const script =
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
      `$z=[System.IO.Compression.ZipFile]::OpenRead('${ps(file)}'); ` +
      "try { foreach($e in $z.Entries){ [Console]::Out.WriteLine(\"$($e.Length)`t$($e.FullName)\") } } finally { $z.Dispose() }";
    const { code, stdout, stderr } = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
    if (code !== 0) throw new Error(`อ่านรายการ zip ไม่ได้: ${stderr.trim()}`);
    return parseTabSized(stdout);
  }

  // tar list (.tar.gz/.tgz ทุก platform; zip บน *nix ใช้ bsdtar list ได้)
  const flag = kind === "tgz" ? "-tzf" : "-tf";
  const { code, stdout, stderr } = await run("tar", [flag, basename(file)], dirname(file));
  if (code !== 0) throw new Error(`อ่านรายการ archive ไม่ได้: ${stderr.trim()}`);
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((name) => ({ name: name.replace(/\\/g, "/"), size: 0 }));
}

function parseTabSized(out: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const tab = line.indexOf("\t");
    if (tab < 0) {
      entries.push({ name: line.trim().replace(/\\/g, "/"), size: 0 });
      continue;
    }
    const size = Number.parseInt(line.slice(0, tab), 10);
    const name = line.slice(tab + 1).replace(/\\/g, "/");
    if (name.trim() !== "") entries.push({ name, size: Number.isFinite(size) ? size : 0 });
  }
  return entries;
}

/** แตก archive ทั้งไฟล์ลง destDir (caller validate รายการ entry มาก่อนแล้ว) */
export async function extractArchive(file: string, destDir: string): Promise<void> {
  const kind = archiveKind(file);
  if (!kind) throw new Error(`unsupported archive type: ${file}`);

  if (kind === "zip" && isWin) {
    const script = `Expand-Archive -LiteralPath '${ps(file)}' -DestinationPath '${ps(destDir)}' -Force`;
    const { code, stderr } = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
    if (code !== 0) throw new Error(`แตก zip ไม่ได้: ${stderr.trim()}`);
    return;
  }

  // tar: ส่ง basename + cwd=dir ของไฟล์ (เลี่ยง drive-letter), -C destDir แตกลงปลายทาง
  const flag = kind === "tgz" ? "-xzf" : "-xf";
  const { code, stderr } = await run("tar", [flag, basename(file), "-C", destDir], dirname(file));
  if (code !== 0) throw new Error(`แตก archive ไม่ได้: ${stderr.trim()}`);
}
