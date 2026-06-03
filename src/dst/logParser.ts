/**
 * Best-effort parse: log line หนึ่งบรรทัด -> event
 *
 * คำเตือน: wording ของ log เปลี่ยนได้ตามเวอร์ชันเกม regex ในนี้ต้องจูนกับ
 * server_log.txt จริง การเช็ค process ขึ้น/ลงเชื่อถือได้เสมอ (ดูที่ exit code)
 * แต่ event ที่ derive จาก log (ready/join/leave) เป็น best-effort เท่านั้น
 */

export type DSTEvent =
  | { type: "ready" }
  | { type: "join"; player: string }
  | { type: "leave"; player: string }
  | { type: "player-count"; count: number }
  | { type: "save" }
  | { type: "shutdown" };

/** pattern แต่ละแบบ — แยกออกมาเป็น const เพื่อให้จูนง่ายในที่เดียว */
const PATTERNS = {
  // "[Shard] Sim paused" / "Starting Up" → ใช้บอกว่า world พร้อมรับ connection
  ready: [
    /Sim paused/i,
    /Reset\(\) returning/i,
    /\[Shard\]\s+Starting up/i,
  ],
  // "[Join Announcement] PlayerName" หรือ "... joined the game"
  join: [
    /\[Join Announcement\]\s+(.+?)\s*$/i,
    /Player\s+(.+?)\s+joined/i,
  ],
  // "[Leave Announcement] PlayerName" หรือ "... left the game"
  leave: [
    /\[Leave Announcement\]\s+(.+?)\s*$/i,
    /Player\s+(.+?)\s+left/i,
  ],
  // ผลลัพธ์ c_listallplayers เช่น "[00:20:10]: [1] (KU_xxxx) Name <wendy>"
  // ไม่ anchor ^ เพราะมี timestamp "[hh:mm:ss]:" นำหน้า — ค้น "[n] (KU_..) Name <" ที่ไหนก็ได้
  playerRow: /\[\d+\]\s+\((KU_[^)]*)\)\s+(.+?)\s+</,
  // บรรทัดสรุปจำนวน เช่น "Total Players: 3"
  playerCount: /Total Players?:\s*(\d+)/i,
  // ผลของ console_.worldInfo() เช่น "[00:20:10]: [DSTINFO] 5 autumn" — ไม่ anchor (มี timestamp นำหน้า)
  worldInfo: /\[DSTINFO\]\s+(\d+|\?)\s+(\S+)/,
  save: /Serializing world|c_save|Saving/i,
  shutdown: /Shutting down|c_shutdown/i,
} as const;

function matchFirst(line: string, regexes: readonly RegExp[]): RegExpMatchArray | null {
  for (const re of regexes) {
    const m = line.match(re);
    if (m) return m;
  }
  return null;
}

/** คืน event หรือ null ถ้าไม่เข้า pattern ใดเลย */
export function parseLogLine(line: string): DSTEvent | null {
  const trimmed = line.trimEnd();
  if (trimmed === "") return null;

  const countMatch = trimmed.match(PATTERNS.playerCount);
  if (countMatch?.[1]) {
    return { type: "player-count", count: Number.parseInt(countMatch[1], 10) };
  }

  const joinMatch = matchFirst(trimmed, PATTERNS.join);
  if (joinMatch?.[1]) return { type: "join", player: joinMatch[1].trim() };

  const leaveMatch = matchFirst(trimmed, PATTERNS.leave);
  if (leaveMatch?.[1]) return { type: "leave", player: leaveMatch[1].trim() };

  if (matchFirst(trimmed, PATTERNS.ready)) return { type: "ready" };
  if (PATTERNS.save.test(trimmed)) return { type: "save" };
  if (PATTERNS.shutdown.test(trimmed)) return { type: "shutdown" };

  return null;
}

/** ดึงชื่อผู้เล่นจากบรรทัดผลของ c_listallplayers (1 บรรทัด = 1 คน) */
export function parsePlayerRow(line: string): string | null {
  const m = line.match(PATTERNS.playerRow);
  return m?.[2] ? m[2].trim() : null;
}

export interface WorldInfo {
  /** วันในเกม (null = parse ไม่ได้/TheWorld ยังไม่พร้อม) */
  day: number | null;
  /** ฤดู เช่น autumn/winter/spring/summer (null = parse ไม่ได้) */
  season: string | null;
}

/** ดึงวัน + ฤดูจากบรรทัดผลของ console_.worldInfo() ("[DSTINFO] <day> <season>") */
export function parseWorldInfo(line: string): WorldInfo | null {
  const m = line.match(PATTERNS.worldInfo);
  if (!m) return null;
  const day = m[1] && m[1] !== "?" ? Number.parseInt(m[1], 10) : null;
  const season = m[2] && m[2] !== "?" ? m[2] : null;
  return { day, season };
}
