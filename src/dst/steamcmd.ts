import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
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

/**
 * แตก archive bootstrapper: zip บน Windows / tar.gz บน *nix
 *
 * - Windows: ใช้ PowerShell Expand-Archive (built-in, รองรับ zip แน่นอน)
 *   ห้ามใช้ `tar` เพราะ `tar` ใน PATH อาจเป็น GNU tar (เช่นที่มากับ Git) ที่อ่าน zip ไม่ได้
 *   ("This does not look like a tar archive") — มีแต่ bsdtar (System32\tar.exe) ที่อ่าน zip ได้
 * - *nix: tar -xzf (.tar.gz)
 *
 * ส่งเป็น "ชื่อไฟล์ล้วน" (basename) + รันใน cwd ที่ไฟล์อยู่ เลี่ยงปัญหา bsdtar ตีความ
 * drive letter (C:\…) ว่าเป็น remote host
 */
function extractArchive(file: string, cwd: string): Promise<void> {
  const name = basename(file);
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(
            "powershell",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `Expand-Archive -LiteralPath '${name.replace(/'/g, "''")}' -DestinationPath . -Force`,
            ],
            { windowsHide: true, cwd },
          )
        : spawn("tar", ["-xzf", name], { windowsHide: true, cwd });
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => reject(new Error(`แตกไฟล์ steamcmd ไม่ได้: ${err.message}`)));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`แตกไฟล์ steamcmd ไม่ได้ (exit ${code ?? "?"}): ${stderr.trim()}`));
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

/** จำนวนครั้งสูงสุดที่ลองรัน SteamCMD (รันแรกมักอัปเดตตัวเอง+exit 7 → ต้องรันซ้ำ) */
const MAX_STEAMCMD_ATTEMPTS = 3;
/** app id ของ "Don't Starve Together" (client) — workshop mod อยู่ใต้ app นี้ ไม่ใช่ 343050 */
const DST_WORKSHOP_APP_ID = "322330";

/** โฟลเดอร์ที่ SteamCMD วาง workshop item ที่โหลดมา: <steamcmd>/steamapps/workshop/content/322330/<id> */
export function workshopItemDir(id: string): string {
  return join(steamcmdDir(), "steamapps", "workshop", "content", DST_WORKSHOP_APP_ID, id);
}

/**
 * spawn SteamCMD ด้วย args ที่ให้ → stream output แล้วคืน exit code
 * SteamCMD อัปเดต progress สดด้วย \r (เขียนทับบรรทัดเดิม) → ตัด \r เป็นเส้นแบ่งบรรทัดด้วย
 * + buffer ส่วนท้ายที่ยังไม่จบบรรทัดไว้รอบหน้า กัน parse ครึ่งบรรทัด
 */
function runSteamcmd(args: string[], onLine: OnLine): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(steamcmdExe(), args, { windowsHide: true, cwd: steamcmdDir() });
    let buf = "";
    const onChunk = (c: Buffer): void => {
      buf += c.toString("utf8");
      const parts = buf.split(/\r\n|\r|\n/);
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (line.trim() !== "") onLine(line.trimEnd());
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("error", (err) => reject(new Error(`รัน SteamCMD ไม่ได้: ${err.message}`)));
    child.on("exit", (code) => {
      if (buf.trim() !== "") onLine(buf.trimEnd());
      resolve(code ?? -1);
    });
  });
}

/** รัน SteamCMD พร้อม retry on exit 7 (รันแรก self-update + restart เป็นปกติ); throw ถ้าไม่ใช่ 0/7 */
async function runSteamcmdWithRetry(args: string[], onLine: OnLine, label: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_STEAMCMD_ATTEMPTS; attempt++) {
    const code = await runSteamcmd(args, onLine);
    if (code === 0) return;
    if (code === 7 && attempt < MAX_STEAMCMD_ATTEMPTS) {
      onLine(`SteamCMD อัปเดตตัวเอง/รีสตาร์ท (exit 7) — กำลังลองใหม่ครั้งที่ ${attempt + 1}...`);
      continue;
    }
    throw new Error(`SteamCMD (${label}) จบด้วย exit code ${code} — ตรวจ log ด้านบน`);
  }
}

/**
 * ดาวน์โหลด SteamCMD (ถ้ายังไม่มี) แล้วติดตั้ง/อัปเดต DST server
 * force_install_dir ต้องมาก่อน login (ข้อจำกัดของ SteamCMD); validate = ตรวจไฟล์ครบ
 */
export async function downloadServer(dst: DSTConfig, onLine: OnLine): Promise<void> {
  await ensureSteamCmd(onLine);
  const args = ["+force_install_dir", dst.installDir, "+login", "anonymous", "+app_update", DST_APP_ID, "validate", "+quit"];
  onLine(`เริ่มติดตั้ง DST server (app ${DST_APP_ID}) → ${dst.installDir}`);
  await runSteamcmdWithRetry(args, onLine, "app_update");
  onLine("✓ DST server พร้อมใช้งานแล้ว");
}

/**
 * โหลด workshop mods (app 322330) ลง <steamcmd>/steamapps/workshop/content/322330/<id>
 * ใช้ login anonymous (mod DST เป็น public) — โหลดทุก id ในรอบเดียว
 * ความสำเร็จราย id ให้ caller ตรวจจาก workshopItemDir(id) หลังจบ (บาง id อาจ private/ถูกลบ)
 * ไม่ throw บน exit != 0 (อาจโหลดบางตัวสำเร็จ) ยกเว้น 7 ที่ retry แล้วยังพัง
 */
export async function downloadWorkshopItems(ids: string[], onLine: OnLine): Promise<void> {
  if (ids.length === 0) return;
  await ensureSteamCmd(onLine);
  const args = ["+login", "anonymous"];
  for (const id of ids) args.push("+workshop_download_item", DST_WORKSHOP_APP_ID, id);
  args.push("+quit");
  onLine(`เริ่มโหลด workshop mods (${ids.length}): ${ids.join(", ")}`);
  for (let attempt = 1; attempt <= MAX_STEAMCMD_ATTEMPTS; attempt++) {
    const code = await runSteamcmd(args, onLine);
    if (code === 0) return;
    if (code === 7 && attempt < MAX_STEAMCMD_ATTEMPTS) {
      onLine(`SteamCMD อัปเดตตัวเอง/รีสตาร์ท (exit 7) — กำลังลองใหม่ครั้งที่ ${attempt + 1}...`);
      continue;
    }
    onLine(`⚠️ SteamCMD จบด้วย exit code ${code} — บาง mod อาจโหลดไม่สำเร็จ (ระบบจะตรวจรายตัว)`);
    return;
  }
}
