import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { BackupConfig, DSTConfig } from "../config.js";
import { clusterDir } from "./paths.js";

/**
 * Backup/restore โฟลเดอร์ cluster เป็นไฟล์ .tar.gz
 *
 * ใช้ `tar` ที่ติดมากับ Windows 10+/Linux/macOS (ไม่ต้องลง dependency เพิ่ม)
 * archive ทั้งโฟลเดอร์ cluster (Master/Caves/cluster.ini/…) โดยเก็บไว้ "นอก" cluster dir
 * จึงไม่ถูกรวมเข้า backup รอบถัดไป
 *
 * transport-agnostic — DSTManager เรียกใช้, Discord ไม่รับรู้รายละเอียด
 */

export interface BackupInfo {
  /** ชื่อไฟล์ (basename) เช่น MyDediServer-20260603-040000.tar.gz */
  file: string;
  /** path เต็ม */
  path: string;
  /** ขนาดไฟล์ (bytes) */
  size: number;
  /** เวลาแก้ไขล่าสุด (ใช้เรียงลำดับ/แสดงผล) */
  mtime: Date;
}

/** โฟลเดอร์แม่ของ cluster (ที่ใช้เป็น -C ของ tar) */
function clusterParent(dst: DSTConfig): string {
  return join(dst.persistentRoot, dst.confDir);
}

/** timestamp แบบ filesystem-safe: YYYYMMDD-HHMMSS (เวลาท้องถิ่น) */
function timestamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** เอาเฉพาะ [a-zA-Z0-9_-] กัน label มั่ว ๆ ทำชื่อไฟล์พัง */
function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * run `tar` แล้ว resolve เมื่อ exit 0; reject พร้อม stderr ถ้าพัง
 *
 * cwd: รัน tar ในโฟลเดอร์ backup เพื่อให้อ้างไฟล์ archive แบบ relative ได้ —
 * bsdtar บน Windows ตีความ path ที่มี drive letter (C:\…) ในอาร์กิวเมนต์ -f
 * เป็น "host:path" (remote) ทำให้พัง การส่งชื่อไฟล์ล้วน ๆ เลี่ยงปัญหานี้
 */
function runTar(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { windowsHide: true, cwd });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => reject(new Error(`tar ทำงานไม่ได้: ${err.message}`)));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exit ${code ?? "?"}: ${stderr.trim() || "(no stderr)"}`));
    });
  });
}

function toInfo(dir: string, file: string): BackupInfo {
  const path = join(dir, file);
  const st = statSync(path);
  return { file, path, size: st.size, mtime: st.mtime };
}

/** prefix ของไฟล์ backup ของ cluster นี้ (กันชนกับ cluster อื่นใน dir เดียวกัน) */
function filePrefix(dst: DSTConfig): string {
  return `${dst.cluster}-`;
}

/**
 * สร้าง backup ใหม่; label (optional) ต่อท้ายชื่อไฟล์ เช่น "pre-rollback"
 * คืน BackupInfo ของไฟล์ที่สร้าง
 */
export async function createBackup(
  dst: DSTConfig,
  backup: BackupConfig,
  label?: string,
): Promise<BackupInfo> {
  if (!existsSync(clusterDir(dst))) {
    throw new Error(`ไม่พบโฟลเดอร์ cluster: ${clusterDir(dst)}`);
  }
  mkdirSync(backup.dir, { recursive: true });

  const tag = label ? `-${sanitizeLabel(label)}` : "";
  const file = `${filePrefix(dst)}${timestamp()}${tag}.tar.gz`;

  // -f <file> เป็นชื่อ relative (cwd=backup.dir); -C <parent> <cluster> archive ทั้งโฟลเดอร์
  await runTar(["-czf", file, "-C", clusterParent(dst), dst.cluster], backup.dir);
  await pruneBackups(dst, backup);
  return toInfo(backup.dir, file);
}

/** list backup ของ cluster นี้ เรียงใหม่→เก่า */
export function listBackups(dst: DSTConfig, backup: BackupConfig): BackupInfo[] {
  if (!existsSync(backup.dir)) return [];
  return readdirSync(backup.dir)
    .filter((f) => f.startsWith(filePrefix(dst)) && f.endsWith(".tar.gz"))
    .map((f) => toInfo(backup.dir, f))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

/**
 * restore backup ทับโฟลเดอร์ cluster — caller ต้อง "หยุด server ก่อน" เสมอ
 * extract ทับไฟล์เดิม (ไฟล์ที่ไม่มีใน archive จะยังอยู่)
 */
export async function restoreBackup(
  dst: DSTConfig,
  backup: BackupConfig,
  fileName: string,
): Promise<void> {
  // กัน path traversal: รับเฉพาะ basename ที่อยู่ใน backup dir จริง
  if (basename(fileName) !== fileName) throw new Error("ชื่อไฟล์ backup ไม่ถูกต้อง");
  if (!existsSync(join(backup.dir, fileName))) {
    throw new Error(`ไม่พบไฟล์ backup: ${fileName}`);
  }

  // -f relative (cwd=backup.dir) เลี่ยงปัญหา bsdtar ตีความ drive letter เป็น remote
  await runTar(["-xzf", fileName, "-C", clusterParent(dst)], backup.dir);
}

/** ลบ backup เก่าสุดที่เกิน keep ทิ้ง */
export async function pruneBackups(dst: DSTConfig, backup: BackupConfig): Promise<void> {
  const all = listBackups(dst, backup); // ใหม่→เก่า
  for (const old of all.slice(backup.keep)) {
    try {
      rmSync(old.path, { force: true });
    } catch {
      // ลบไม่ได้ก็ข้าม ไม่ให้ล้ม backup flow
    }
  }
}

/** ฟอร์แมตขนาดไฟล์ให้อ่านง่าย (B/KB/MB) */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
