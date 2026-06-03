/**
 * สร้าง string คำสั่ง Lua ที่จะเขียนเข้า stdin ของ shard process
 * ทุกคำสั่งต้องปิดท้ายด้วย "\n" — หน้าที่ใส่ "\n" อยู่ที่ ShardProcess.sendCommand
 * โมดูลนี้คืน "ตัว expression" อย่างเดียว (pure, ไม่มี side-effect)
 */

/** escape string ให้ปลอดภัยเมื่อยัดเข้า Lua string literal (")…(") */
function luaString(s: string): string {
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
  return `"${escaped}"`;
}

export const console_ = {
  /** บันทึกโลกทันที */
  save(): string {
    return "c_save()";
  },

  /** ปิด server; save=true จะ save ก่อนปิด (graceful) */
  shutdown(save = true): string {
    return `c_shutdown(${save ? "true" : "false"})`;
  },

  /** ประกาศข้อความให้ผู้เล่นทุกคนเห็น */
  announce(msg: string): string {
    return `c_announce(${luaString(msg)})`;
  },

  /** list ผู้เล่นทั้งหมด (ผลออก stdout — ต้อง parse แบบ best-effort) */
  listAllPlayers(): string {
    return "c_listallplayers()";
  },

  /**
   * print วัน + ฤดูปัจจุบันออก stdout เป็น "[DSTINFO] <day> <season>" (best-effort)
   * วัน = cycles + 1 (cycles เริ่มที่ 0 = วันที่ 1); season เป็น string เช่น autumn/winter
   * guard กรณี TheWorld ยังไม่พร้อม (print "?")
   */
  worldInfo(): string {
    return (
      'print("[DSTINFO] "..(TheWorld and tostring(TheWorld.state.cycles + 1) or "?")' +
      '.." "..(TheWorld and tostring(TheWorld.state.season) or "?"))'
    );
  },

  /** reset shard (restart โลกจาก save ล่าสุด) */
  reset(): string {
    return "c_reset()";
  },

  /** rollback ไป n save ก่อนหน้า — ย้อนไม่ได้ ควรยืนยันก่อน */
  rollback(n: number): string {
    const safe = Math.max(0, Math.floor(n));
    return `c_rollback(${safe})`;
  },

  /** regenerate โลกใหม่ทั้งหมด — ทำลาย save ปัจจุบัน ย้อนไม่ได้ ต้องยืนยัน */
  regenerateWorld(): string {
    return "c_regenerateworld()";
  },
} as const;
