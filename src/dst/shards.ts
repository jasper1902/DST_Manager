import { existsSync, readdirSync, readFileSync } from "node:fs";
import ini from "ini";
import type { DSTConfig } from "../config.js";
import { clusterDir, serverIniPath } from "./paths.js";

/**
 * ค้นหา shard ของ cluster จากระบบไฟล์ — รองรับจำนวน shard เท่าไรก็ได้ (N-shard)
 *
 * shard = โฟลเดอร์ที่มี server.ini; master = ตัวที่ `[SHARD] is_master = true`
 * (engine รองรับ shard กี่ตัวก็ได้ ตัวที่ไม่ใช่ master connect เข้า master)
 */

type IniData = Record<string, Record<string, unknown>>;

/** อ่าน is_master จาก server.ini ของ shard (best-effort; พัง/ไม่มี = false) */
function isMasterShard(dst: DSTConfig, shard: string): boolean {
  try {
    const data = ini.parse(readFileSync(serverIniPath(dst, shard), "utf8")) as IniData;
    const shardSec = data.SHARD ?? data.shard ?? {};
    return String(shardSec.is_master).toLowerCase() === "true";
  } catch {
    return false;
  }
}

/**
 * คืนรายชื่อ shard ตามลำดับ start: master ก่อน แล้วตัวอื่นเรียงตามตัวอักษร
 * คืน [] ถ้าไม่พบ cluster dir (ให้ caller fallback)
 */
export function discoverShards(dst: DSTConfig): string[] {
  const dir = clusterDir(dst);
  if (!existsSync(dir)) return [];

  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(serverIniPath(dst, e.name)))
    .map((e) => e.name);

  const masters = folders.filter((f) => isMasterShard(dst, f));
  const others = folders
    .filter((f) => !masters.includes(f))
    .sort((a, b) => a.localeCompare(b));

  // master ก่อนเสมอ (ต้อง start ก่อน dependents); ถ้าหา master ไม่เจอก็คืนตามที่มี
  return [...masters, ...others];
}
