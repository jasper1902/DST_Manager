import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "discord.js";
import type { AppConfig } from "./config.js";
import { missingRequired } from "./config.js";
import { createBot } from "./discord/bot.js";
import { registerCommands } from "./discord/register.js";
import { createBackup, restoreBackup } from "./dst/backup.js";
import { importCluster, type ImportOptions, type ImportResult, type ImportSource } from "./dst/importer.js";
import { DSTManager, type ManagerCrashEvent } from "./dst/manager.js";
import { appBaseDir, clusterDir, serverInstalled } from "./dst/paths.js";
import { createRestartScheduler, type RestartScheduler } from "./dst/scheduler.js";
import { downloadServer, hasSteamcmd } from "./dst/steamcmd.js";

export type BotState = "stopped" | "starting" | "running" | "stopping";

/** จำนวนบรรทัด log ของการติดตั้งที่เก็บไว้ให้ web ดึงไปโชว์ */
const INSTALL_LOG_MAX = 200;

/** สถานะการดาวน์โหลด/ติดตั้ง DST server (snapshot ให้ web poll) */
export interface InstallStatus {
  installed: boolean;
  hasSteamcmd: boolean;
  running: boolean;
  done: boolean;
  error: string | null;
  log: string[];
  installDir: string;
  /** % ความคืบหน้า (parse จาก output SteamCMD); null = ยังไม่รู้/อยู่ช่วงที่วัดไม่ได้ → bar แบบ indeterminate */
  progress: number | null;
  /** ช่วงการทำงานปัจจุบันจาก SteamCMD เช่น "downloading", "verifying" (null = ไม่ทราบ) */
  phase: string | null;
}

/**
 * ดึง % และ phase จากบรรทัด SteamCMD เช่น
 *   "Update state (0x61) downloading, progress: 42.34 (1234 / 5678)"
 * ข้ามบรรทัดสรุปท้าย ("unknown, progress: 0.00 (0 / 0)") ที่ไม่งั้นจะรีเซ็ต bar เป็น 0% ก่อนจบ
 */
function parseInstallProgress(line: string): { progress: number; phase: string } | null {
  const m = line.match(/Update state\s*\([^)]*\)\s*([a-z ]+?),\s*progress:\s*([\d.]+)\s*\((\d+)\s*\/\s*(\d+)\)/i);
  if (!m) return null;
  const phase = (m[1] ?? "").trim();
  const total = Number(m[4]);
  const p = Number.parseFloat(m[2] ?? "");
  if (phase === "unknown" || total === 0 || !Number.isFinite(p)) return null;
  return { progress: Math.max(0, Math.min(100, p)), phase };
}

/** สถานะการ import world (snapshot ให้ web poll — โครงเดียวกับ InstallStatus) */
export interface ImportJobStatus {
  running: boolean;
  done: boolean;
  error: string | null;
  log: string[];
  progress: number | null;
  phase: string | null;
  summary: ImportResult | null;
}

/**
 * คุม lifecycle ของบอท (manager + Discord client + scheduler) แบบ start/stop ได้ตามสั่ง
 *
 * แยกออกจาก process: web server รันตลอด ส่วนบอทเปิด/ปิดได้จากปุ่มใน web UI
 * config ถือไว้ที่นี่ — เปลี่ยนได้ตอน stopped แล้วค่อย start ใหม่ให้มีผล
 */
export class BotApp {
  private _state: BotState = "stopped";
  private _config: AppConfig;
  private _manager: DSTManager | null = null;
  private bot: Client | null = null;
  private scheduler: RestartScheduler | null = null;
  private lastError: string | null = null;
  private install = {
    running: false,
    done: false,
    error: null as string | null,
    log: [] as string[],
    progress: null as number | null,
    phase: null as string | null,
  };
  private importJob = {
    running: false,
    done: false,
    error: null as string | null,
    log: [] as string[],
    progress: null as number | null,
    phase: null as string | null,
    summary: null as ImportResult | null,
  };

  constructor(config: AppConfig) {
    this._config = config;
  }

  get state(): BotState {
    return this._state;
  }
  get manager(): DSTManager | null {
    return this._manager;
  }
  get config(): AppConfig {
    return this._config;
  }
  get error(): string | null {
    return this.lastError;
  }

  /** เปลี่ยน config (อนุญาตเฉพาะตอน bot หยุด เพื่อให้ค่าใหม่มีผลตอน start) */
  setConfig(config: AppConfig): void {
    this._config = config;
  }

  /** snapshot สถานะการติดตั้ง DST server (ให้ web poll โชว์ progress) */
  installStatus(): InstallStatus {
    return {
      installed: serverInstalled(this._config.dst),
      hasSteamcmd: hasSteamcmd(),
      running: this.install.running,
      done: this.install.done,
      error: this.install.error,
      log: this.install.log,
      installDir: this._config.dst.installDir,
      progress: this.install.progress,
      phase: this.install.phase,
    };
  }

  /**
   * เริ่มดาวน์โหลด/อัปเดต DST server แบบ background — คืนทันที (web poll ดู progress ผ่าน installStatus)
   * ต้องให้บอทหยุดก่อน (กันติดตั้งทับขณะ server รัน)
   */
  installServer(): void {
    if (this._state !== "stopped") throw new Error("ต้องหยุดบอทก่อนถึงจะติดตั้ง/อัปเดต server ได้");
    if (this.install.running) throw new Error("กำลังติดตั้งอยู่แล้ว");

    this.install = { running: true, done: false, error: null, log: [], progress: null, phase: null };
    const push = (line: string): void => {
      this.install.log.push(line);
      if (this.install.log.length > INSTALL_LOG_MAX) this.install.log.shift();
      const p = parseInstallProgress(line);
      if (p) {
        this.install.progress = p.progress;
        this.install.phase = p.phase;
      }
    };

    void downloadServer(this._config.dst, push)
      .then(() => {
        this.install.done = true;
        this.install.progress = 100;
        this.install.phase = null;
      })
      .catch((err: unknown) => {
        this.install.error = err instanceof Error ? err.message : String(err);
        push(`✗ ${this.install.error}`);
      })
      .finally(() => {
        this.install.running = false;
      });
  }

  /** snapshot สถานะการ import (ให้ web poll) */
  importStatus(): ImportJobStatus {
    return {
      running: this.importJob.running,
      done: this.importJob.done,
      error: this.importJob.error,
      log: this.importJob.log,
      progress: this.importJob.progress,
      phase: this.importJob.phase,
      summary: this.importJob.summary,
    };
  }

  /**
   * import world เข้าทับ cluster ปัจจุบัน (background) — ต้องให้บอทหยุดก่อน (ไม่มี shard รัน)
   * backup cluster ปัจจุบันก่อนเสมอ แล้ว rollback ให้ถ้า import พัง
   */
  importWorld(source: ImportSource, opts: ImportOptions): void {
    if (this._state !== "stopped") throw new Error("ต้องหยุดบอทก่อนถึงจะ import world ได้");
    if (this.importJob.running) throw new Error("กำลัง import อยู่แล้ว");
    if (this._config.dst.cluster === "") throw new Error("ตั้งชื่อ cluster ก่อนถึงจะ import ได้");

    this.importJob = { running: true, done: false, error: null, log: [], progress: null, phase: null, summary: null };
    const dst = this._config.dst;
    const backupCfg = this._config.backup;
    const log = (line: string): void => {
      this.importJob.log.push(line);
      if (this.importJob.log.length > INSTALL_LOG_MAX) this.importJob.log.shift();
    };
    const progress = (pct: number | null, phase: string | null): void => {
      this.importJob.progress = pct;
      this.importJob.phase = phase;
    };

    const stagingDir = join(appBaseDir(), "imports", `stage-${randomUUID()}`);
    mkdirSync(stagingDir, { recursive: true });

    void (async () => {
      let backupFile: string | null = null;
      try {
        // backup ของเดิมก่อนทับ (ถ้ามี cluster อยู่) เผื่อต้อง rollback
        if (existsSync(clusterDir(dst))) {
          log("backing up current cluster (pre-import)...");
          backupFile = (await createBackup(dst, backupCfg, "pre-import")).file;
          log(`backup: ${backupFile}`);
        }
        const result = await importCluster(dst, source, opts, stagingDir, { log, progress });
        for (const w of result.warnings) log(`⚠️ ${w}`);
        this.importJob.summary = result;
        this.importJob.done = true;
        this.importJob.progress = 100;
        this.importJob.phase = null;
        log(`✓ imported ${result.applied} file(s), shards: ${result.shards.join(", ") || "-"}`);
      } catch (err: unknown) {
        this.importJob.error = err instanceof Error ? err.message : String(err);
        log(`✗ ${this.importJob.error}`);
        if (backupFile) {
          try {
            log("rolling back to pre-import backup...");
            await restoreBackup(dst, backupCfg, backupFile);
            log("rolled back");
          } catch (rb) {
            log(`✗ rollback failed: ${rb instanceof Error ? rb.message : String(rb)}`);
          }
        }
      } finally {
        try {
          rmSync(stagingDir, { recursive: true, force: true });
        } catch {
          // ลบ staging ไม่ได้ก็ข้าม
        }
        // ลบไฟล์ archive ที่อัปโหลดมา (เฉพาะที่อยู่ในโฟลเดอร์ imports ของเรา)
        if (source.kind === "archive" && source.path.startsWith(join(appBaseDir(), "imports"))) {
          try {
            rmSync(source.path, { force: true });
          } catch {
            // ข้าม
          }
        }
        this.importJob.running = false;
      }
    })();
  }

  /** start บอท; throw ถ้า config ยังไม่ครบ หรือกำลังรันอยู่ */
  async start(): Promise<void> {
    if (this._state !== "stopped") throw new Error("บอทกำลังรัน/เปลี่ยนสถานะอยู่");
    const missing = missingRequired(this._config);
    if (missing.length > 0) throw new Error(`config ยังไม่ครบ: ${missing.join(", ")}`);

    this._state = "starting";
    this.lastError = null;
    try {
      const config = this._config;
      const manager = new DSTManager(config);
      const bot = createBot(config, manager);
      this._manager = manager;
      this.bot = bot;
      this.attachErrorCapture(manager, bot);
      this.scheduler = createRestartScheduler(manager, config.dailyRestartTime);
      this.scheduler?.start();

      try {
        await registerCommands(config);
      } catch (err) {
        console.error("⚠️ register slash command ไม่สำเร็จ (ใช้ของเดิมต่อ):", err);
      }

      await bot.login(config.discord.token);
      this._state = "running";
      console.log("✓ บอทเริ่มทำงานแล้ว");
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      await this.cleanup();
      this._state = "stopped";
      throw err;
    }
  }

  /**
   * จับ error/crash ที่เกิด "ตอน runtime" (หลัง start สำเร็จ) มาเก็บใน lastError
   * เพื่อให้ web UI (ผ่าน /api/bot/state) แสดงได้ — ไม่ใช่แค่ error ตอน start
   */
  private attachErrorCapture(manager: DSTManager, bot: Client): void {
    manager.on("crash", (e: ManagerCrashEvent) => {
      // restarting=false คือ crash ถี่เกินจน manager ยอมแพ้ (กัน crash loop) — ปัญหาจริงที่ต้องแจ้ง
      if (!e.restarting) {
        this.lastError = `Shard "${e.shard}" crash ซ้ำเกินกำหนด (exit code ${e.code ?? "?"}) — หยุด auto-restart แล้ว ตรวจ log ของ shard`;
        console.error("✗", this.lastError);
      }
    });
    bot.on("error", (err: Error) => {
      this.lastError = `Discord client error: ${err.message}`;
      console.error("✗", this.lastError);
    });
  }

  /** stop บอท + หยุด DST server ที่ดูแลอยู่ */
  async stop(): Promise<void> {
    if (this._state === "stopped") return;
    this._state = "stopping";
    try {
      await this._manager?.stop();
    } catch (err) {
      console.error("Error stopping DST server:", err);
    }
    await this.cleanup();
    this._state = "stopped";
    console.log("✓ บอทหยุดแล้ว");
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async cleanup(): Promise<void> {
    this.scheduler?.stop();
    this.scheduler = null;
    if (this.bot) {
      try {
        await this.bot.destroy();
      } catch {
        // ignore
      }
      this.bot = null;
    }
    this._manager = null;
  }
}
