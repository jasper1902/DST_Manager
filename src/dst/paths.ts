import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { DSTConfig } from "../config.js";

/**
 * โฟลเดอร์รากของไฟล์ทั้งหมด (config.json / games / steamcmd / backups อยู่ที่นี่)
 *  - compiled exe (dst-manager.exe) → โฟลเดอร์เดียวกับ exe เพื่อให้พกพาได้ (วาง exe ที่ไหนก็รันที่นั่น)
 *  - dev (bun run src/index.ts) → cwd ของโปรเจกต์
 * detect compiled ด้วยชื่อ execPath (bun dev → execPath = bun, compiled → dst-manager*)
 */
export function appBaseDir(): string {
  return /^dst-manager/i.test(basename(process.execPath)) ? dirname(process.execPath) : process.cwd();
}

/** โฟลเดอร์เกม DST: <base>\games\DoNotStarveTogether (เผื่อรองรับเกมอื่นในอนาคต) */
export function gameRootDir(): string {
  return join(appBaseDir(), "games", "DoNotStarveTogether");
}

/**
 * ชื่อ binary ต่าง platform: Windows มี .exe, Linux ไม่มี
 * resolve ตาม process.platform เพื่อให้ย้ายข้าม OS ได้โดยไม่แก้โค้ด
 */
function serverBinaryName(): string {
  const base = "dontstarve_dedicated_server_nullrenderer_x64";
  return process.platform === "win32" ? `${base}.exe` : base;
}

/** server binary ถูกติดตั้งแล้วหรือยัง (ใช้เช็คก่อน start / โชว์สถานะใน web) */
export function serverInstalled(dst: DSTConfig): boolean {
  return existsSync(binaryPath(dst));
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

/** path ของ cluster_token.txt (server token จาก Klei; จำเป็นต่อการ start server) */
export function clusterTokenPath(dst: DSTConfig): string {
  return join(clusterDir(dst), "cluster_token.txt");
}

/** path ของ adminlist.txt (รายชื่อ admin = Klei UserID/game id ต่อบรรทัด) */
export function adminListPath(dst: DSTConfig): string {
  return join(clusterDir(dst), "adminlist.txt");
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

/** โฟลเดอร์ mods ของ server install (<install>/mods) */
export function modsDir(dst: DSTConfig): string {
  return join(dst.installDir, "mods");
}

/** dedicated_server_mods_setup.lua — รายการ ServerModSetup ให้ engine โหลด workshop mods ตอน boot */
export function modsSetupPath(dst: DSTConfig): string {
  return join(modsDir(dst), "dedicated_server_mods_setup.lua");
}

/** โฟลเดอร์ม็อดที่ติดตั้งในรูปแบบ local: <install>/mods/workshop-<id> */
export function installedModDir(dst: DSTConfig, id: string): string {
  return join(modsDir(dst), `workshop-${id}`);
}

/**
 * หา modinfo.lua ของม็อด (สำหรับอ่าน schema config) — ลอง mods/workshop-<id> ก่อน
 * แล้วค่อย ugc_mods/<cluster>/Master/content/322330/<id>; คืน null ถ้ายังไม่ถูกดาวน์โหลด
 */
export function modInfoPath(dst: DSTConfig, id: string): string | null {
  const candidates = [
    join(installedModDir(dst, id), "modinfo.lua"),
    join(dst.installDir, "ugc_mods", dst.cluster, "Master", "content", "322330", id, "modinfo.lua"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
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
