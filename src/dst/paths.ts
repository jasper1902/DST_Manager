import { join } from "node:path";
import type { DSTConfig } from "../config.js";

/**
 * ชื่อ binary ต่าง platform: Windows มี .exe, Linux ไม่มี
 * resolve ตาม process.platform เพื่อให้ย้ายข้าม OS ได้โดยไม่แก้โค้ด
 */
function serverBinaryName(): string {
  const base = "dontstarve_dedicated_server_nullrenderer_x64";
  return process.platform === "win32" ? `${base}.exe` : base;
}

/** path เต็มของ binary: <install>\bin64\<name> */
export function binaryPath(dst: DSTConfig): string {
  return join(dst.installDir, "bin64", serverBinaryName());
}

/** cwd ตอน spawn ต้องเป็น bin64 ไม่งั้น engine หา asset ไม่เจอ */
export function binaryCwd(dst: DSTConfig): string {
  return join(dst.installDir, "bin64");
}

/** โฟลเดอร์ cluster: <root>\<confDir>\<cluster> */
export function clusterDir(dst: DSTConfig): string {
  return join(dst.persistentRoot, dst.confDir, dst.cluster);
}

/** โฟลเดอร์ shard เช่น <cluster>\Master, <cluster>\Caves */
export function shardDir(dst: DSTConfig, shard: string): string {
  return join(clusterDir(dst), shard);
}

/** path ของ cluster.ini */
export function clusterIniPath(dst: DSTConfig): string {
  return join(clusterDir(dst), "cluster.ini");
}

/** path ของ server.ini ต่อ shard */
export function serverIniPath(dst: DSTConfig, shard: string): string {
  return join(shardDir(dst, shard), "server.ini");
}

/** path ของ server_log.txt ต่อ shard (ไว้ tail/parse) */
export function serverLogPath(dst: DSTConfig, shard: string): string {
  return join(shardDir(dst, shard), "server_log.txt");
}

/** path ของ modoverrides.lua ต่อ shard (รายชื่อ/ค่า mod ที่เปิดใช้; อาจไม่มีไฟล์) */
export function modOverridesPath(dst: DSTConfig, shard: string): string {
  return join(shardDir(dst, shard), "modoverrides.lua");
}

/**
 * args สำหรับ launch shard หนึ่งตัว
 * -console เปิด stdin Lua console, persistent root + conf dir ชี้ที่เก็บ cluster
 */
export function launchArgs(dst: DSTConfig, shard: string): string[] {
  return [
    "-console",
    "-cluster",
    dst.cluster,
    "-shard",
    shard,
    "-persistent_storage_root",
    dst.persistentRoot,
    "-conf_dir",
    dst.confDir,
  ];
}
