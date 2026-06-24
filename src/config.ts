import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appBaseDir, gameRootDir } from "./dst/paths.js";

/**
 * Config ทั้งหมดเก็บใน config.json (ไม่ใช้ .env แล้ว)
 * แก้ผ่าน web UI setup → saveConfig() เขียนลงไฟล์
 *
 * config.json มี secret (token) → ต้อง gitignore
 */

export interface DiscordConfig {
  token: string;
  clientId: string;
  guildId: string;
  adminRoleId?: string;
  channelCategory: string;
  logChannelName: string;
  statusTextChannelName: string;
  controlChannelName: string;
  actionLogChannelName: string;
}

export interface DSTConfig {
  /** path ตัว dedicated server — derive อัตโนมัติเป็น <base>\games\DoNotStarveTogether\server (ไม่ใช่ user input) */
  installDir: string;
  /** persistent_storage_root — derive เป็น <base>\games\DoNotStarveTogether */
  persistentRoot: string;
  /** conf_dir — fix เป็น "clusters" */
  confDir: string;
  /** ชื่อ cluster ที่จะเปิด (user input) */
  cluster: string;
  /** override รายชื่อ shard (เว้น = auto-discover จากโฟลเดอร์ที่มี server.ini) */
  shards?: string[];
}

export interface StatusConfig {
  messageIntervalSec: number;
  nameIntervalSec: number;
  showPassword: boolean;
}

export interface BackupConfig {
  dir: string;
  keep: number;
}

export interface WebConfig {
  host: string;
  port: number;
  /** token auth API; เว้นว่าง = generate ให้ตอน boot แล้ว persist */
  token: string;
}

export interface AppConfig {
  discord: DiscordConfig;
  dst: DSTConfig;
  status: StatusConfig;
  backup: BackupConfig;
  web: WebConfig;
  logBufferSize: number;
  autoRestart: boolean;
  dailyRestartTime?: string;
}

/** รูปแบบดิบในไฟล์ (ทุก field optional — เติม default ตอนโหลด) */
interface RawConfig {
  discord?: Partial<DiscordConfig>;
  dst?: Partial<DSTConfig>;
  status?: Partial<StatusConfig>;
  backup?: Partial<BackupConfig>;
  web?: Partial<WebConfig>;
  logBufferSize?: number;
  autoRestart?: boolean;
  dailyRestartTime?: string;
}

export const CONFIG_FILE = join(appBaseDir(), "config.json");

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function readRaw(): RawConfig {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as RawConfig;
  } catch {
    return {}; // ไฟล์เสีย → เริ่มจากค่าว่าง (setup ใหม่)
  }
}

/** โหลด config จาก config.json + เติม default; field ที่จำเป็นอาจว่างได้ (เช็คด้วย missingRequired) */
export function loadConfig(): AppConfig {
  const raw = readRaw();
  // path ติดตั้ง/persistent derive จากตำแหน่ง exe เสมอ — ละค่าใน config.json (กัน path เก่าค้าง)
  const gameRoot = gameRootDir();
  const installDir = join(gameRoot, "server");
  const persistentRoot = gameRoot;
  const confDir = "clusters";
  const shards = raw.dst?.shards?.filter((s) => str(s) !== "");

  return {
    discord: {
      token: str(raw.discord?.token),
      clientId: str(raw.discord?.clientId),
      guildId: str(raw.discord?.guildId),
      adminRoleId: str(raw.discord?.adminRoleId) || undefined,
      channelCategory: str(raw.discord?.channelCategory) || "DST Manager",
      logChannelName: str(raw.discord?.logChannelName) || "dst-logs",
      statusTextChannelName: str(raw.discord?.statusTextChannelName) || "dst-status",
      controlChannelName: str(raw.discord?.controlChannelName) || "dst-control",
      actionLogChannelName: str(raw.discord?.actionLogChannelName) || "dst-actions",
    },
    dst: {
      installDir,
      persistentRoot,
      confDir,
      cluster: str(raw.dst?.cluster),
      shards: shards && shards.length > 0 ? shards : undefined,
    },
    status: {
      messageIntervalSec: raw.status?.messageIntervalSec ?? 60,
      nameIntervalSec: Math.max(300, raw.status?.nameIntervalSec ?? 300),
      showPassword: raw.status?.showPassword ?? true,
    },
    backup: {
      dir: str(raw.backup?.dir) || join(appBaseDir(), "backups"),
      keep: Math.max(1, raw.backup?.keep ?? 10),
    },
    web: {
      host: str(raw.web?.host) || "127.0.0.1",
      port: raw.web?.port ?? 8787,
      token: str(raw.web?.token),
    },
    logBufferSize: raw.logBufferSize ?? 500,
    autoRestart: raw.autoRestart ?? true,
    dailyRestartTime: str(raw.dailyRestartTime) || undefined,
  };
}

/** เขียน config ลง config.json */
export function saveConfig(config: AppConfig): void {
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/** field ที่จำเป็นต่อการรันบอท — คืนรายการที่ยังว่าง (ว่าง = พร้อมรัน) */
export function missingRequired(c: AppConfig): string[] {
  const missing: string[] = [];
  if (!c.discord.token) missing.push("Discord token");
  if (!c.discord.clientId) missing.push("Discord client ID");
  if (!c.discord.guildId) missing.push("Discord guild ID");
  if (!c.dst.cluster) missing.push("DST cluster");
  return missing;
}
