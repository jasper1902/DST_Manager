import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { DSTConfig } from "../config.js";
import { clusterDir, clusterIniPath, serverIniPath, shardDir } from "./paths.js";

/**
 * สร้างไฟล์ config พื้นฐานของ cluster เมื่อยังไม่มี (ตอน start)
 *
 * DST boot ไม่ได้ถ้าขาด cluster.ini (ระดับ cluster) หรือ server.ini (ระดับ shard)
 * — ฟังก์ชันนี้สร้าง default ให้เฉพาะไฟล์ที่ "ขาด" เท่านั้น ไม่ทับของเดิม
 * ปรับค่าเพิ่มเติมได้ภายหลังผ่าน /config หรือหน้าเว็บ (cluster.ini whitelist)
 */

/** cluster.ini เริ่มต้น: Master + shard เปิด (รองรับเพิ่ม Caves ภายหลัง), console เปิดเพื่อรับคำสั่งผ่าน stdin */
function defaultClusterIni(): string {
  const clusterKey = randomBytes(8).toString("hex");
  return [
    "[GAMEPLAY]",
    "game_mode = survival",
    "max_players = 6",
    "pvp = false",
    "pause_when_empty = true",
    "",
    "[NETWORK]",
    "cluster_name = DST Server",
    "cluster_description = ",
    "cluster_intention = cooperative",
    "cluster_password = ",
    "",
    "[MISC]",
    "console_enabled = true",
    "",
    "[SHARD]",
    "shard_enabled = true",
    "bind_ip = 127.0.0.1",
    "master_ip = 127.0.0.1",
    "master_port = 10888",
    `cluster_key = ${clusterKey}`,
    "",
  ].join("\n");
}

/**
 * server.ini เริ่มต้นต่อ shard — แยกพอร์ตตาม index กันชนกันเมื่อมีหลาย shard
 * shard แรก (Master) เป็น is_master = true; ที่เหลือเป็น dependent (มี name/id)
 */
function defaultServerIni(shard: string, isMaster: boolean, index: number): string {
  const lines = [
    "[NETWORK]",
    `server_port = ${11000 + index}`,
    "",
    "[SHARD]",
    `is_master = ${isMaster}`,
  ];
  if (!isMaster) {
    lines.push(`name = ${shard}`, `id = ${index + 1}`);
  }
  lines.push(
    "",
    "[STEAM]",
    `master_server_port = ${27018 + index}`,
    `authentication_port = ${8768 + index}`,
    "",
  );
  return lines.join("\n");
}

/**
 * ทำให้ cluster.ini + server.ini ของแต่ละ shard มีครบก่อน start
 * คืนรายชื่อไฟล์ที่ "เพิ่งสร้าง" (ว่าง = มีครบอยู่แล้ว) ไว้แจ้ง user/log
 */
export function ensureClusterFiles(dst: DSTConfig, shardNames: string[]): string[] {
  const created: string[] = [];

  mkdirSync(clusterDir(dst), { recursive: true });
  if (!existsSync(clusterIniPath(dst))) {
    writeFileSync(clusterIniPath(dst), defaultClusterIni(), "utf8");
    created.push("cluster.ini");
  }

  shardNames.forEach((name, i) => {
    if (existsSync(serverIniPath(dst, name))) return;
    const isMaster = i === 0 || name === "Master";
    mkdirSync(shardDir(dst, name), { recursive: true });
    writeFileSync(serverIniPath(dst, name), defaultServerIni(name, isMaster, i), "utf8");
    created.push(`${name}/server.ini`);
  });

  return created;
}
