import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DSTConfig } from "../config.js";
import { appBaseDir } from "./paths.js";

/**
 * ดาวน์โหลด/อัปเดต DST dedicated server ผ่าน SteamCMD
 *
 * SteamCMD คือวิธีมาตรฐานเดียวของ Klei (ไม่มี installer แยก) — login anonymous ได้
 * ไม่ต้องมีบัญชี Steam โปรแกรมจะโหลด bootstrapper (steamcmd.zip) มาแตกเองครั้งแรก
 * แล้ว SteamCMD จะ self-update + ดึงตัว server (app 343050) เข้า <installDir>
 *
 * transport-agnostic — รับ callback onLine สำหรับ stream progress (web เอาไปโชว์)
 *
 * หมายเหตุ: SteamCMD เคยมีปัญหา force_install_dir ที่ path มีช่องว่าง
 * แนะนำวาง dst-manager.exe ในโฟลเดอร์ที่ path ไม่มีช่องว่าง
 */

/** app id ของ "Don't Starve Together Dedicated Server" บน Steam */
const DST_APP_ID = "343050";

const STEAMCMD_URL =
  process.platform === "win32"
    ? "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
    : "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz";

/** โฟลเดอร์ SteamCMD: <base>\steamcmd */
export function steamcmdDir(): string {
  return join(appBaseDir(), "steamcmd");
}

/** path ของตัวรัน SteamCMD */
export function steamcmdExe(): string {
  return join(steamcmdDir(), process.platform === "win32" ? "steamcmd.exe" : "steamcmd.sh");
}

/** SteamCMD bootstrapper ถูกแตกไว้แล้วหรือยัง */
export function hasSteamcmd(): boolean {
  return existsSync(steamcmdExe());
}

type OnLine = (line: string) => void;

/** แตก archive (zip บน Win / tar.gz บน *nix) ด้วย tar ที่ติดมากับ OS — pattern เดียวกับ backup.ts */
function extractArchive(file: string, cwd: string): Promise<void> {
  const args = process.platform === "win32" ? ["-xf", file] : ["-xzf", file];
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { windowsHide: true, cwd });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => reject(new Error(`tar ทำงานไม่ได้: ${err.message}`)));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`แตกไฟล์ steamcmd ไม่ได้ (tar exit ${code ?? "?"}): ${stderr.trim()}`));
    });
  });
}

/** โหลด steamcmd.zip มาแตกถ้ายังไม่มี (no-op ถ้ามี exe แล้ว) */
export async function ensureSteamCmd(onLine: OnLine): Promise<void> {
  if (hasSteamcmd()) return;
  const dir = steamcmdDir();
  mkdirSync(dir, { recursive: true });

  onLine(`กำลังดาวน์โหลด SteamCMD จาก ${STEAMCMD_URL} ...`);
  const res = await fetch(STEAMCMD_URL);
  if (!res.ok) throw new Error(`ดาวน์โหลด SteamCMD ไม่สำเร็จ: HTTP ${res.status}`);
  const archive = join(dir, process.platform === "win32" ? "steamcmd.zip" : "steamcmd_linux.tar.gz");
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

  onLine("กำลังแตกไฟล์ SteamCMD ...");
  await extractArchive(archive, dir);
  try {
    rmSync(archive, { force: true });
  } catch {
    // ลบ archive ไม่ได้ก็ข้าม ไม่กระทบการใช้งาน
  }
  onLine("ติดตั้ง SteamCMD เรียบร้อย");
}

/**
 * รัน SteamCMD ติดตั้ง/อัปเดตตัว server เข้า dst.installDir
 * force_install_dir ต้องมาก่อน login (ข้อจำกัดของ SteamCMD); validate = ตรวจไฟล์ครบ
 */
function runSteamcmdInstall(dst: DSTConfig, onLine: OnLine): Promise<void> {
  const args = [
    "+force_install_dir",
    dst.installDir,
    "+login",
    "anonymous",
    "+app_update",
    DST_APP_ID,
    "validate",
    "+quit",
  ];
  return new Promise((resolve, reject) => {
    onLine(`เริ่มติดตั้ง DST server (app ${DST_APP_ID}) → ${dst.installDir}`);
    const child = spawn(steamcmdExe(), args, { windowsHide: true, cwd: steamcmdDir() });
    const onChunk = (c: Buffer): void => {
      for (const line of c.toString("utf8").split(/\r?\n/)) {
        if (line.trim() !== "") onLine(line.trimEnd());
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("error", (err) => reject(new Error(`รัน SteamCMD ไม่ได้: ${err.message}`)));
    child.on("exit", (code) => {
      // SteamCMD ใช้ exit code 7 (warning) ในบาง flow ที่จริงๆ สำเร็จ — ยึด 0 เป็นหลัก
      if (code === 0) resolve();
      else reject(new Error(`SteamCMD จบด้วย exit code ${code ?? "?"} — ตรวจ log ด้านบน`));
    });
  });
}

/** ดาวน์โหลด SteamCMD (ถ้ายังไม่มี) แล้วติดตั้ง/อัปเดต DST server */
export async function downloadServer(dst: DSTConfig, onLine: OnLine): Promise<void> {
  await ensureSteamCmd(onLine);
  await runSteamcmdInstall(dst, onLine);
  onLine("✓ DST server พร้อมใช้งานแล้ว");
}
