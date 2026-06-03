import type { DSTManager } from "./manager.js";

/**
 * Restart อัตโนมัติรายวันตามเวลา "HH:MM" (เวลาท้องถิ่นของเครื่อง)
 * DST รั่ว memory เป็นปกติ การ restart รายวันช่วยให้ server นิ่งขึ้น
 *
 * ก่อน restart จะ c_announce นับถอยหลังให้ผู้เล่นรู้ตัว; ถ้า server ไม่ได้รันอยู่
 * จะข้ามรอบนั้นไป (ไม่ปลุก server ที่ตั้งใจปิด)
 *
 * transport-agnostic — ทำงานบน DSTManager ตรง ๆ ไม่ผูกกับ Discord
 */

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** parse "HH:MM" → [hour, minute]; คืน null ถ้า format ผิด */
export function parseTime(s: string): [number, number] | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number.parseInt(m[1]!, 10);
  const min = Number.parseInt(m[2]!, 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return [h, min];
}

export class RestartScheduler {
  private readonly manager: DSTManager;
  private readonly hour: number;
  private readonly minute: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(manager: DSTManager, hour: number, minute: number) {
    this.manager = manager;
    this.hour = hour;
    this.minute = minute;
  }

  /** ms จากตอนนี้ถึงเวลา HH:MM ครั้งถัดไป (วันนี้ถ้ายังไม่ถึง ไม่งั้นพรุ่งนี้) */
  private nextDelayMs(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(this.hour, this.minute, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  start(): void {
    this.schedule();
    const hh = String(this.hour).padStart(2, "0");
    const mm = String(this.minute).padStart(2, "0");
    console.log(`✓ ตั้ง restart อัตโนมัติรายวันเวลา ${hh}:${mm}`);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const delay = this.nextDelayMs();
    this.timer = setTimeout(() => void this.fire(), delay);
    this.timer.unref();
  }

  private async fire(): Promise<void> {
    try {
      if (this.manager.status().some((s) => s.running)) {
        this.manager.announce("⚠️ เซิร์ฟเวอร์จะรีสตาร์ทอัตโนมัติใน 1 นาที");
        await sleep(50_000);
        this.manager.announce("⚠️ รีสตาร์ทใน 10 วินาที — เตรียมตัว");
        await sleep(10_000);
        await this.manager.restart();
        console.log("[scheduler] restart รายวันเสร็จแล้ว");
      }
    } catch (err) {
      console.error("[scheduler] restart รายวันล้มเหลว:", err);
    } finally {
      this.schedule(); // ตั้งรอบถัดไปเสมอ
    }
  }
}

/** สร้าง scheduler ถ้า timeStr ถูกต้อง; คืน null ถ้าไม่ได้ตั้ง/format ผิด (พร้อม warn) */
export function createRestartScheduler(
  manager: DSTManager,
  timeStr: string | undefined,
): RestartScheduler | null {
  if (!timeStr) return null;
  const parsed = parseTime(timeStr);
  if (!parsed) {
    console.warn(`[scheduler] DAILY_RESTART_TIME "${timeStr}" format ผิด (ต้องเป็น HH:MM) — ข้าม`);
    return null;
  }
  return new RestartScheduler(manager, parsed[0], parsed[1]);
}
