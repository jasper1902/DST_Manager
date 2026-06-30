import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { DSTConfig } from "../config.js";
import { adminListPath, clusterDir } from "./paths.js";

/**
 * จัดการ adminlist.txt ของ cluster — รายชื่อ admin ในเกม (Klei UserID / game id แบบ KU_…)
 * 1 บรรทัด = 1 id; admin สั่ง c_* / kick ในเกมได้
 *
 * แก้ไฟล์นี้ "มีผลตอน restart server" (engine อ่าน adminlist ตอน boot)
 */

/** game id ของ Klei รูปแบบ KU_ ตามด้วยตัวอักษร/ตัวเลข (กัน inject newline/space ลงไฟล์) */
const ID_RE = /^KU_[A-Za-z0-9_-]+$/;

export function isValidAdminId(id: string): boolean {
  return ID_RE.test(id.trim());
}

/** อ่านรายชื่อ admin (unique, ตัดบรรทัดว่าง) */
export function readAdminList(dst: DSTConfig): string[] {
  try {
    const path = adminListPath(dst);
    if (!existsSync(path)) return [];
    const ids = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s !== "");
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

function writeAdminList(dst: DSTConfig, ids: string[]): void {
  mkdirSync(clusterDir(dst), { recursive: true });
  writeFileSync(adminListPath(dst), ids.length > 0 ? `${ids.join("\n")}\n` : "", "utf8");
}

/** เพิ่ม admin (validate รูปแบบ id; กันซ้ำ) → คืนรายชื่อใหม่ */
export function addAdmin(dst: DSTConfig, id: string): string[] {
  const value = id.trim();
  if (!isValidAdminId(value)) throw new Error("game id ไม่ถูกต้อง — ต้องเป็นรูปแบบ KU_…");
  const cur = readAdminList(dst);
  if (!cur.includes(value)) cur.push(value);
  writeAdminList(dst, cur);
  return cur;
}

/** ลบ admin → คืนรายชื่อใหม่ */
export function removeAdmin(dst: DSTConfig, id: string): string[] {
  const value = id.trim();
  const cur = readAdminList(dst).filter((x) => x !== value);
  writeAdminList(dst, cur);
  return cur;
}
