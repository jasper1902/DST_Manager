import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

export interface ShardProcessOptions {
  /** ชื่อ shard เช่น "Master", "Caves" (ใช้ใน log/event) */
  name: string;
  binaryPath: string;
  cwd: string;
  args: string[];
  /** จำนวนบรรทัด log สูงสุดที่เก็บใน ring buffer */
  bufferSize: number;
}

export type ShardState = "stopped" | "starting" | "running" | "stopping";

/**
 * Supervise shard process ตัวเดียว: spawn, เขียน stdin, เก็บ stdout เป็น ring buffer
 *
 * Events:
 *  - "line"  (line: string)  ทุกบรรทัดที่ออกจาก stdout/stderr (ไว้ mirror/parse)
 *  - "state" (state: ShardState)
 *  - "exit"  (code: number | null, signal: NodeJS.Signals | null, intentional: boolean)
 *            intentional = true เมื่อ exit มาจากการสั่งหยุด (stop/forceKill) ไม่ใช่ crash
 *
 * โมดูลนี้ "ไม่รู้จัก" คำสั่ง Lua หรือ Discord — รับ string ดิบเขียน stdin เท่านั้น
 */
export class ShardProcess extends EventEmitter {
  readonly name: string;
  private readonly binaryPath: string;
  private readonly cwd: string;
  private readonly args: string[];
  private readonly bufferSize: number;

  private child: ChildProcessWithoutNullStreams | null = null;
  private state: ShardState = "stopped";
  private readonly buffer: string[] = [];
  private stdoutTail = "";
  /** ตั้งเป็น true ก่อนสั่งหยุด เพื่อให้ exit ถัดไปถูกตีความว่า "ตั้งใจ" ไม่ใช่ crash */
  private stopRequested = false;

  constructor(opts: ShardProcessOptions) {
    super();
    this.name = opts.name;
    this.binaryPath = opts.binaryPath;
    this.cwd = opts.cwd;
    this.args = opts.args;
    this.bufferSize = Math.max(1, opts.bufferSize);
  }

  getState(): ShardState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state === "running" || this.state === "starting";
  }

  /** บอกว่า exit ที่กำลังจะเกิดเป็นการ "ตั้งใจหยุด" (manager เรียกก่อน shutdown/forceKill) */
  requestStop(): void {
    this.stopRequested = true;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  /** snapshot ของ log buffer (คัดลอก array กันถูกแก้จากข้างนอก) */
  logs(limit?: number): string[] {
    if (limit === undefined || limit >= this.buffer.length) {
      return [...this.buffer];
    }
    return this.buffer.slice(this.buffer.length - limit);
  }

  private setState(next: ShardState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit("state", next);
  }

  private pushLine(line: string): void {
    this.buffer.push(line);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.bufferSize);
    }
    this.emit("line", line);
  }

  /** แยก chunk จาก stdout เป็นบรรทัด (เก็บเศษที่ยังไม่จบบรรทัดไว้ต่อ) */
  private handleChunk(chunk: Buffer): void {
    this.stdoutTail += chunk.toString("utf8");
    const parts = this.stdoutTail.split(/\r?\n/);
    this.stdoutTail = parts.pop() ?? "";
    for (const line of parts) this.pushLine(line);
  }

  /** spawn process; ถ้ากำลังรันอยู่แล้วจะ throw */
  start(): void {
    if (this.isRunning()) {
      throw new Error(`Shard ${this.name} is already running`);
    }
    this.setState("starting");
    this.stdoutTail = "";
    this.stopRequested = false; // start ใหม่ = exit ครั้งหน้ายังไม่ใช่การตั้งใจหยุด

    const child = spawn(this.binaryPath, this.args, {
      cwd: this.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    this.child = child;

    child.stdout.on("data", (c: Buffer) => this.handleChunk(c));
    child.stderr.on("data", (c: Buffer) => this.handleChunk(c));

    child.once("spawn", () => this.setState("running"));

    child.once("error", (err: Error) => {
      this.pushLine(`[manager] spawn error: ${err.message}`);
      this.child = null;
      this.setState("stopped");
    });

    child.once("exit", (code, signal) => {
      if (this.stdoutTail !== "") {
        this.pushLine(this.stdoutTail);
        this.stdoutTail = "";
      }
      const intentional = this.stopRequested;
      this.stopRequested = false;
      this.child = null;
      this.setState("stopped");
      this.emit("exit", code, signal, intentional);
    });
  }

  /** เขียนคำสั่ง Lua หนึ่งบรรทัดเข้า stdin (ใส่ "\n" ให้เอง) */
  sendCommand(lua: string): void {
    if (!this.child || !this.isRunning()) {
      throw new Error(`Shard ${this.name} is not running`);
    }
    this.child.stdin.write(`${lua}\n`);
  }

  /** รอ process exit; resolve true ถ้า exit ทันเวลา, false ถ้า timeout */
  waitForExit(timeoutMs: number): Promise<boolean> {
    if (!this.child) return Promise.resolve(true);
    const child = this.child;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        child.removeListener("exit", onExit);
        resolve(false);
      }, timeoutMs);
      const onExit = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once("exit", onExit);
    });
  }

  /**
   * force-kill: Windows ไม่มี SIGKILL จริง และ proc.kill() ฆ่าแค่ตัวแม่
   * → ใช้ taskkill /T /F ฆ่าทั้ง process tree; platform อื่นใช้ SIGKILL
   */
  forceKill(): void {
    const pid = this.child?.pid;
    if (pid === undefined) return;
    this.setState("stopping");

    if (process.platform === "win32") {
      // detached + ignore stdio กัน taskkill ค้างผูกกับ process เรา
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("error", (err) => {
        this.pushLine(`[manager] taskkill error: ${err.message}`);
      });
    } else {
      this.child?.kill("SIGKILL");
    }
  }
}
