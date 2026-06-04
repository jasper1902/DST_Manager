import { EventEmitter } from "node:events";
import type { AppConfig, BackupConfig, DSTConfig } from "../config.js";
import { type BackupInfo, createBackup, listBackups, restoreBackup } from "./backup.js";
import { console_ } from "./console.js";
import { parsePlayerRow, parseWorldInfo, type WorldInfo } from "./logParser.js";
import { getModList, type ModEntry } from "./mods.js";
import { binaryCwd, binaryPath, launchArgs } from "./paths.js";
import { ShardProcess, type ShardState } from "./process.js";
import { discoverShards } from "./shards.js";

/** เว้นช่วงให้ Master ตั้งตัวก่อน start dependents */
const START_DELAY_MS = 8_000;
/** รอ graceful shutdown นานสุดก่อน force-kill */
const STOP_TIMEOUT_MS = 30_000;
/** หน้าต่างเวลาเก็บผลลัพธ์ c_listallplayers */
const PLAYER_QUERY_WINDOW_MS = 1_500;
/** หน้าต่างเวลาเก็บผลลัพธ์ console_.worldInfo() */
const WORLD_QUERY_WINDOW_MS = 1_000;
/** auto-restart: เว้นช่วงก่อน start ใหม่หลัง crash */
const CRASH_RESTART_DELAY_MS = 5_000;
/** auto-restart: ถ้า crash เกิน MAX ครั้งในหน้าต่างนี้ → ยอมแพ้ (กัน crash loop) */
const CRASH_WINDOW_MS = 120_000;
const MAX_CRASH_RESTARTS = 3;

export interface ShardStatus {
  shard: string;
  state: ShardState;
  running: boolean;
  pid: number | undefined;
}

/** event ที่ manager ปล่อยออก (transport-agnostic — ใครจะ subscribe ก็ได้) */
export interface ManagerLineEvent {
  shard: string;
  line: string;
}

/** shard ตายเองโดยไม่ได้สั่ง (crash) — restarting บอกว่ากำลัง auto-restart หรือยอมแพ้แล้ว */
export interface ManagerCrashEvent {
  shard: string;
  code: number | null;
  restarting: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ตัดสินใจรายชื่อ shard ตามลำดับความสำคัญ:
 *  1) DST_SHARDS override (ดัน "Master" ขึ้นหน้าถ้ามี)
 *  2) auto-discover จากโฟลเดอร์ที่มี server.ini
 *  3) fallback: Master อย่างเดียว — เผื่อ cluster dir ยังไม่ถูกสร้าง
 */
function resolveShardNames(dst: DSTConfig): string[] {
  if (dst.shards && dst.shards.length > 0) {
    return [...dst.shards].sort((a, b) => (a === "Master" ? -1 : b === "Master" ? 1 : 0));
  }
  const discovered = discoverShards(dst);
  if (discovered.length > 0) return discovered;
  return ["Master"];
}

/**
 * DSTManager — orchestrate shards ของ cluster เดียว
 *
 * ออกแบบให้ transport-agnostic: ไม่รู้จัก Discord เลย ใครจะเรียก (bot/web/daemon)
 * ก็เรียก method เดียวกัน และ subscribe event "line"/"state"/"exit" ได้
 *
 * Events:
 *  - "line"  (e: ManagerLineEvent)
 *  - "state" (shard: string, state: ShardState)
 *  - "exit"  (shard: string, code: number | null)
 *  - "crash" (e: ManagerCrashEvent)  shard ตายเองโดยไม่ได้สั่ง
 */
export class DSTManager extends EventEmitter {
  private readonly dst: DSTConfig;
  private readonly backupCfg: BackupConfig;
  private readonly autoRestart: boolean;
  private readonly shardNames: string[];
  private readonly shards = new Map<string, ShardProcess>();
  /** timestamp ของการ auto-restart ล่าสุดต่อ shard (กัน crash loop) */
  private readonly crashTimes = new Map<string, number[]>();

  constructor(config: AppConfig) {
    super();
    this.dst = config.dst;
    this.backupCfg = config.backup;
    this.autoRestart = config.autoRestart;
    this.shardNames = resolveShardNames(config.dst);
    console.log(`✓ shards: ${this.shardNames.join(", ")}`);

    for (const name of this.shardNames) {
      const shard = new ShardProcess({
        name,
        binaryPath: binaryPath(this.dst),
        cwd: binaryCwd(this.dst),
        args: launchArgs(this.dst, name),
        bufferSize: config.logBufferSize,
      });
      shard.on("line", (line: string) =>
        this.emit("line", { shard: name, line } satisfies ManagerLineEvent),
      );
      shard.on("state", (state: ShardState) => this.emit("state", name, state));
      shard.on("exit", (code: number | null, _signal, intentional: boolean) => {
        this.emit("exit", name, code);
        if (!intentional && this.autoRestart) this.handleCrash(name, code);
      });
      this.shards.set(name, shard);
    }
  }

  /**
   * shard ตายเองโดยไม่ได้สั่ง: emit "crash" แล้ว auto-restart ถ้ายังไม่ crash ถี่เกินไป
   * crash เกิน MAX_CRASH_RESTARTS ใน CRASH_WINDOW_MS → ยอมแพ้ (restarting=false) กัน loop
   */
  private handleCrash(name: string, code: number | null): void {
    const now = Date.now();
    const recent = (this.crashTimes.get(name) ?? []).filter((t) => now - t < CRASH_WINDOW_MS);

    if (recent.length >= MAX_CRASH_RESTARTS) {
      this.emit("crash", { shard: name, code, restarting: false } satisfies ManagerCrashEvent);
      return;
    }

    recent.push(now);
    this.crashTimes.set(name, recent);
    this.emit("crash", { shard: name, code, restarting: true } satisfies ManagerCrashEvent);

    const timer = setTimeout(() => {
      const shard = this.shards.get(name);
      if (shard && !shard.isRunning()) {
        try {
          shard.start();
        } catch {
          // start ไม่ได้ (เช่น binary หาย) → ปล่อยให้ exit/crash รอบหน้าจัดการ
        }
      }
    }, CRASH_RESTART_DELAY_MS);
    timer.unref();
  }

  /** รายชื่อ shard ตามลำดับ start (master ก่อน, dependents ทีหลัง) */
  activeShards(): string[] {
    return this.shardNames;
  }

  private getShard(name: string): ShardProcess {
    const shard = this.shards.get(name);
    if (!shard) throw new Error(`Unknown shard: ${name}`);
    return shard;
  }

  // ── lifecycle ──────────────────────────────────────────────────────

  /** start ทุก shard ตามลำดับ; Master ก่อนแล้วเว้นช่วงค่อย start dependents */
  async start(): Promise<void> {
    const order = this.activeShards();
    for (let i = 0; i < order.length; i++) {
      const name = order[i]!;
      const shard = this.getShard(name);
      if (shard.isRunning()) continue;
      shard.start();
      // เว้นช่วงหลัง Master (ตัวแรก) ก่อนปลุก dependents
      if (i === 0 && order.length > 1) await sleep(START_DELAY_MS);
    }
  }

  /**
   * stop graceful: dependents (Caves) ก่อน Master
   * ส่ง c_shutdown(true) → รอ exit → timeout แล้ว force-kill (taskkill /T /F)
   */
  async stop(): Promise<void> {
    const order = [...this.activeShards()].reverse();
    for (const name of order) {
      const shard = this.getShard(name);
      if (!shard.isRunning()) continue;
      shard.requestStop(); // exit หลังจากนี้ = ตั้งใจ ไม่ใช่ crash → ไม่ auto-restart
      try {
        shard.sendCommand(console_.shutdown(true));
      } catch {
        // เขียน stdin ไม่ได้ (process กำลังตาย) → ข้ามไป force-kill
      }
      const exited = await shard.waitForExit(STOP_TIMEOUT_MS);
      if (!exited) shard.forceKill();
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  // ── status / logs ──────────────────────────────────────────────────

  status(): ShardStatus[] {
    return this.activeShards().map((name) => {
      const shard = this.getShard(name);
      return {
        shard: name,
        state: shard.getState(),
        running: shard.isRunning(),
        pid: shard.pid,
      };
    });
  }

  logs(shard: string, limit?: number): string[] {
    return this.getShard(shard).logs(limit);
  }

  /**
   * รายการม็อดที่ cluster เปิดใช้ (อ่านจาก modoverrides.lua + resolve ชื่อจาก Steam)
   * ไม่ขึ้นกับว่า server รันอยู่หรือไม่ (อ่านจากไฟล์ตรง ๆ)
   * คืน null ถ้าไม่มี modoverrides.lua เลย (เซิร์ฟไม่ได้ลงม็อด)
   */
  async getMods(): Promise<ModEntry[] | null> {
    return getModList(this.dst, this.shardNames);
  }

  // ── console actions ────────────────────────────────────────────────

  /** ส่งคำสั่ง Lua ดิบไป shard เดียว (low-level) */
  sendConsole(shard: string, lua: string): void {
    this.getShard(shard).sendCommand(lua);
  }

  /** ส่งคำสั่งไปทุก shard ที่กำลังรัน; คืนจำนวน shard ที่ส่งสำเร็จ */
  private broadcast(lua: string): number {
    let sent = 0;
    for (const name of this.activeShards()) {
      const shard = this.getShard(name);
      if (!shard.isRunning()) continue;
      try {
        shard.sendCommand(lua);
        sent++;
      } catch {
        // ข้าม shard ที่เขียน stdin ไม่ได้
      }
    }
    return sent;
  }

  /** ประกาศข้อความให้ผู้เล่นทุก shard */
  announce(msg: string): number {
    return this.broadcast(console_.announce(msg));
  }

  /** save โลกทุก shard */
  save(): number {
    return this.broadcast(console_.save());
  }

  /**
   * list ผู้เล่น: ยิง c_listallplayers ทุก shard แล้วเก็บ stdout ในหน้าต่างสั้น ๆ
   * best-effort — pattern อาจต้องจูน (ดู logParser) คืนรายชื่อ unique เรียงตามเจอ
   */
  async listPlayers(): Promise<string[]> {
    const running = this.activeShards()
      .map((name) => this.getShard(name))
      .filter((s) => s.isRunning());

    const results = await Promise.all(
      running.map((shard) => this.collectPlayers(shard)),
    );

    const seen = new Set<string>();
    const players: string[] = [];
    for (const list of results) {
      for (const p of list) {
        if (!seen.has(p)) {
          seen.add(p);
          players.push(p);
        }
      }
    }
    return players;
  }

  /**
   * วัน + ฤดูในเกมปัจจุบัน (best-effort) — query เฉพาะ Master (โลกหลัก)
   * คืน null ถ้า Master ไม่ได้รัน หรือ parse ไม่ได้ในหน้าต่างเวลา
   */
  async getWorldInfo(): Promise<WorldInfo | null> {
    const master = this.shards.get("Master");
    if (!master || !master.isRunning()) return null;
    return this.collectWorldInfo(master);
  }

  /** ยิง console_.worldInfo() ไป shard เดียวแล้วเก็บวัน+ฤดูจาก stdout */
  private collectWorldInfo(shard: ShardProcess): Promise<WorldInfo | null> {
    return new Promise<WorldInfo | null>((resolve) => {
      let info: WorldInfo | null = null;
      const onLine = (line: string): void => {
        const parsed = parseWorldInfo(line);
        if (parsed) info = parsed;
      };
      shard.on("line", onLine);
      try {
        shard.sendCommand(console_.worldInfo());
      } catch {
        shard.removeListener("line", onLine);
        resolve(null);
        return;
      }
      setTimeout(() => {
        shard.removeListener("line", onLine);
        resolve(info);
      }, WORLD_QUERY_WINDOW_MS);
    });
  }

  /** ยิง c_listallplayers ไป shard เดียวแล้วเก็บชื่อผู้เล่นจาก stdout */
  private collectPlayers(shard: ShardProcess): Promise<string[]> {
    return new Promise<string[]>((resolve) => {
      const found: string[] = [];
      const onLine = (line: string): void => {
        const player = parsePlayerRow(line);
        if (player) found.push(player);
      };
      shard.on("line", onLine);
      try {
        shard.sendCommand(console_.listAllPlayers());
      } catch {
        shard.removeListener("line", onLine);
        resolve([]);
        return;
      }
      setTimeout(() => {
        shard.removeListener("line", onLine);
        resolve(found);
      }, PLAYER_QUERY_WINDOW_MS);
    });
  }

  // ── backup / restore ───────────────────────────────────────────────

  /** สร้าง backup ของ cluster (label ต่อท้ายชื่อไฟล์ เช่น "pre-rollback") */
  async backup(label?: string): Promise<BackupInfo> {
    return createBackup(this.dst, this.backupCfg, label);
  }

  /** list backup ที่มี (ใหม่→เก่า) */
  listBackups(): BackupInfo[] {
    return listBackups(this.dst, this.backupCfg);
  }

  /** restore backup ทับ cluster — ต้องไม่มี shard รันอยู่ (กันไฟล์โดนเขียนทับขณะใช้งาน) */
  async restore(fileName: string): Promise<void> {
    const running = this.activeShards().some((n) => this.getShard(n).isRunning());
    if (running) throw new Error("ต้อง /stop server ให้หยุดก่อนถึงจะ restore ได้");
    await restoreBackup(this.dst, this.backupCfg, fileName);
  }

  // ── world ops (ย้อนไม่ได้ — caller ต้องยืนยันก่อนเรียก) ────────────

  /** rollback ไป n save ก่อนหน้า ที่ shard (default Master) */
  rollback(n: number, shard = "Master"): void {
    this.getShard(shard).sendCommand(console_.rollback(n));
  }

  /** regenerate โลกใหม่ทั้งหมด ที่ shard (default Master) */
  regenerateWorld(shard = "Master"): void {
    this.getShard(shard).sendCommand(console_.regenerateWorld());
  }
}
