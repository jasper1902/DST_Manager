/**
 * i18n กลางสำหรับ string ที่ฝั่ง "server-side" สร้าง (Discord adapter + web server)
 *
 * - ภาษาเริ่มต้น = อังกฤษ ("en"); ภาษาที่สอง = ไทย ("th")
 * - ปรับภาษาได้จาก web UI → เก็บใน config.json (field `language`)
 * - หน้าเว็บ (page.ts) มี dictionary ฝั่ง client แยกของตัวเอง — ไฟล์นี้ไม่เกี่ยวกับ DOM
 *
 * ค่าของแต่ละ key เป็น string ตรง ๆ หรือฟังก์ชัน (เมื่อมีตัวแปรแทรก)
 * เรียกผ่าน makeT(lang) → t("key", ...args)
 */

export type Lang = "en" | "th";
export const DEFAULT_LANG: Lang = "en";

/** normalize ค่าที่อ่านมา (จาก config/HTTP) ให้เป็น Lang ที่ถูกต้อง — อื่น ๆ → default */
export function asLang(v: unknown): Lang {
  return v === "th" ? "th" : "en";
}

/** ฤดู DST → ป้ายข้อความ + emoji ตามภาษา */
const SEASONS: Record<string, { en: string; th: string }> = {
  autumn: { en: "🍂 Autumn", th: "🍂 ใบไม้ร่วง" },
  winter: { en: "❄️ Winter", th: "❄️ ฤดูหนาว" },
  spring: { en: "🌷 Spring", th: "🌷 ใบไม้ผลิ" },
  summer: { en: "☀️ Summer", th: "☀️ ฤดูร้อน" },
};

export function seasonLabel(season: string | null, lang: Lang): string {
  if (!season) return "—";
  return SEASONS[season.toLowerCase()]?.[lang] ?? season;
}

// biome หมายเหตุ: ใช้ any[] เพื่อให้แต่ละ entry ระบุชนิด param ของตัวเองได้อิสระ
// (t() เรียกแบบ variadic — ความปลอดภัยอยู่ที่ฝั่งนิยาม MESSAGES)
type MsgFn = (...args: any[]) => string;
interface Msg {
  en: string | MsgFn;
  th: string | MsgFn;
}

const MESSAGES = {
  // ── Discord: permission / generic ──────────────────────────────
  cmd_no_permission: { en: "❌ You don't have permission to use this command", th: "❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้" },
  btn_no_permission: { en: "❌ You don't have permission to use this button", th: "❌ คุณไม่มีสิทธิ์ใช้ปุ่มนี้" },
  unknown_command: { en: (name: string) => `Unknown command: ${name}`, th: (name: string) => `ไม่รู้จักคำสั่ง: ${name}` },
  unknown_button: { en: (a: string) => `Unknown button: ${a}`, th: (a: string) => `ไม่รู้จักปุ่ม: ${a}` },
  unsupported_subcommand: { en: (s: string) => `Unsupported subcommand: ${s}`, th: (s: string) => `subcommand ไม่รองรับ: ${s}` },
  error_occurred: { en: (m: string) => `⚠️ An error occurred: ${m}`, th: (m: string) => `⚠️ เกิดข้อผิดพลาด: ${m}` },
  no_perm_suffix: { en: "(no permission)", th: "(ไม่มีสิทธิ์)" },
  button_prefix: { en: "[button]", th: "[ปุ่ม]" },

  // ── Discord: control results ───────────────────────────────────
  start_done: { en: "🟢 Started (Master first, then other shards)", th: "🟢 สั่ง start แล้ว (Master ก่อน แล้ว shard อื่น)" },
  start_done_short: { en: "🟢 Started", th: "🟢 สั่ง start แล้ว" },
  stop_done: { en: "🔴 Server stopped (saved before shutdown)", th: "🔴 ปิด server เรียบร้อย (save ก่อนปิด)" },
  restart_done: { en: "🔄 Restarted", th: "🔄 รีสตาร์ทเรียบร้อย" },
  save_done: { en: (n: number) => `💾 Saved (${n} shard${n === 1 ? "" : "s"})`, th: (n: number) => `💾 สั่ง save แล้ว (${n} shard)` },
  no_shard_running: { en: "⚠️ No shard is running", th: "⚠️ ไม่มี shard ที่กำลังรัน" },
  backup_short: { en: (f: string, s: string) => `💾 backup: \`${f}\` (${s})`, th: (f: string, s: string) => `💾 backup: \`${f}\` (${s})` },

  // ── Discord: players / logs ────────────────────────────────────
  players_online: { en: (n: number) => `👥 Players online (${n})`, th: (n: number) => `👥 ผู้เล่นออนไลน์ (${n})` },
  no_players: { en: "No players online (or the server isn't running)", th: "ไม่มีผู้เล่นออนไลน์ (หรือ server ไม่ได้รัน)" },
  no_logs: { en: "(no logs yet)", th: "(ยังไม่มี log)" },
  logs_header: { en: (shard: string, n: number) => `**${shard}** — last ${n} line${n === 1 ? "" : "s"}`, th: (shard: string, n: number) => `**${shard}** — ${n} บรรทัดล่าสุด` },

  // ── Discord: mods ──────────────────────────────────────────────
  mods_no_file: { en: "ℹ️ No `modoverrides.lua` found — this server has no mods enabled", th: "ℹ️ ไม่พบ `modoverrides.lua` — server นี้ไม่ได้เปิดใช้ม็อด" },
  mods_none_enabled: { en: "ℹ️ Mod file exists but no mods are enabled", th: "ℹ️ มีไฟล์ม็อดแต่ไม่มีม็อดที่เปิดใช้" },
  mods_header: { en: (on: number, total: number) => `🧩 Mods in use (${on}/${total} enabled)`, th: (on: number, total: number) => `🧩 ม็อดที่ใช้ (${on}/${total} เปิดอยู่)` },

  // ── Discord: announce / save ───────────────────────────────────
  announce_none: { en: "⚠️ No shard is running — announcement not sent", th: "⚠️ ไม่มี shard ที่กำลังรัน — ประกาศไม่ออก" },
  announce_done: { en: (n: number, m: string) => `📢 Announced (${n} shard${n === 1 ? "" : "s"}): ${m}`, th: (n: number, m: string) => `📢 ประกาศแล้ว (${n} shard): ${m}` },

  // ── Discord: confirm flow ──────────────────────────────────────
  confirm: { en: "Confirm", th: "ยืนยัน" },
  cancel: { en: "Cancel", th: "ยกเลิก" },
  cancelled: { en: "❌ Cancelled", th: "❌ ยกเลิกแล้ว" },
  processing: { en: "⏳ Working...", th: "⏳ กำลังดำเนินการ..." },
  confirm_timeout: { en: "⌛ Confirmation timed out — cancelled automatically", th: "⌛ หมดเวลายืนยัน — ยกเลิกอัตโนมัติ" },
  failed: { en: (m: string) => `⚠️ Failed: ${m}`, th: (m: string) => `⚠️ ล้มเหลว: ${m}` },
  server_not_running_action: { en: (a: string) => `⚠️ Server isn't running — can't ${a}`, th: (a: string) => `⚠️ server ไม่ได้รันอยู่ — ${a} ไม่ได้` },

  // ── Discord: rollback / regenerate / restore ───────────────────
  rollback_warning: {
    en: (count: number) =>
      `⚠️ **Rollback ${count} save${count === 1 ? "" : "s"}** — progress after that point will be lost\n` +
      `The current world will be backed up first automatically — press "Confirm" within 30 seconds`,
    th: (count: number) =>
      `⚠️ **Rollback ${count} save** — ย้อนโลกกลับ ความคืบหน้าหลังจุดนั้นจะหาย\n` +
      `ระบบจะ backup ปัจจุบันก่อนอัตโนมัติ — กด "ยืนยัน" ภายใน 30 วินาที`,
  },
  rollback_done: {
    en: (count: number, file: string) => `↩️ Rolled back ${count} save${count === 1 ? "" : "s"}\n💾 previous backup: \`${file}\``,
    th: (count: number, file: string) => `↩️ rollback ${count} save แล้ว\n💾 backup ก่อนหน้า: \`${file}\``,
  },
  regenerate_warning: {
    en:
      "🔥 **Regenerate world** — a brand new world will be generated and the current save destroyed permanently\n" +
      'The current world will be backed up first automatically — press "Confirm" within 30 seconds',
    th:
      "🔥 **Regenerate world** — สร้างโลกใหม่ทั้งหมด เซฟปัจจุบันจะถูกทำลายถาวร\n" +
      'ระบบจะ backup ปัจจุบันก่อนอัตโนมัติ — กด "ยืนยัน" ภายใน 30 วินาที',
  },
  regenerate_done: {
    en: (file: string) => `🌱 Regenerating world\n💾 previous backup: \`${file}\``,
    th: (file: string) => `🌱 สั่ง regenerate world แล้ว\n💾 backup ก่อนหน้า: \`${file}\``,
  },
  restore_must_stop: { en: "⚠️ You must `/stop` the server before you can restore", th: "⚠️ ต้อง `/stop` ให้ server หยุดก่อนถึงจะ restore ได้" },
  restore_warning: {
    en: (file: string) => `⚠️ **Restore** \`${file}\` over the current world — the current state will be overwritten\n` + 'Press "Confirm" within 30 seconds',
    th: (file: string) => `⚠️ **Restore** \`${file}\` ทับโลกปัจจุบัน — สถานะปัจจุบันจะถูกเขียนทับ\n` + 'กด "ยืนยัน" ภายใน 30 วินาที',
  },
  restore_done: { en: (file: string) => `✓ Restored \`${file}\` — use \`/start\` to launch the server`, th: (file: string) => `✓ restore \`${file}\` แล้ว — ใช้ \`/start\` เพื่อเปิด server` },

  // ── Discord: backup subcommands ────────────────────────────────
  backup_created: { en: (f: string, s: string) => `💾 backup created: \`${f}\` (${s})`, th: (f: string, s: string) => `💾 backup สำเร็จ: \`${f}\` (${s})` },
  backup_list_empty: { en: "No backups yet — use `/backup create` to make one", th: "ยังไม่มี backup — ใช้ `/backup create` สร้างได้" },
  backup_list_header: { en: (n: number) => `💾 latest backups (${n})`, th: (n: number) => `💾 backup ล่าสุด (${n})` },

  // ── Discord: config ────────────────────────────────────────────
  config_set: { en: (k: string, v: string) => `✓ Set \`${k}\` = \`${v}\`\n⚠️ takes effect after /restart`, th: (k: string, v: string) => `✓ ตั้งค่า \`${k}\` = \`${v}\`\n⚠️ มีผลหลัง /restart` },

  // ── Discord: crash alert ───────────────────────────────────────
  crash_restarting: { en: (shard: string, code: string) => `⚠️ shard **${shard}** crashed (exit ${code}) — auto-restarting`, th: (shard: string, code: string) => `⚠️ shard **${shard}** ล่ม (exit ${code}) — กำลัง restart อัตโนมัติ` },
  crash_giveup: { en: (shard: string) => `🛑 shard **${shard}** crashed repeatedly in a short time — auto-restart stopped, manual check needed`, th: (shard: string) => `🛑 shard **${shard}** ล่มซ้ำหลายครั้งในเวลาสั้น ๆ — หยุด auto-restart แล้ว ต้องเข้าไปตรวจเอง` },

  // ── Discord: control panel ─────────────────────────────────────
  control_panel_desc: {
    en:
      "Press a button to control the server (only users with the admin role)\n" +
      "▶️ start · ⏹️ stop · 🔄 restart · 💾 save · 🗄️ backup · 📊 status · 👥 players\n" +
      "_Irreversible commands (rollback/regenerate/restore) are slash commands only, for safety_",
    th:
      "กดปุ่มเพื่อสั่งงาน server (เฉพาะผู้มีสิทธิ์ตาม admin role)\n" +
      "▶️ เปิด · ⏹️ ปิด · 🔄 รีสตาร์ท · 💾 เซฟ · 🗄️ backup · 📊 สถานะ · 👥 ผู้เล่น\n" +
      "_คำสั่งย้อนไม่ได้ (rollback/regenerate/restore) ใช้ผ่าน slash command เพื่อความปลอดภัย_",
  },

  // ── Discord: status presence (embed) ───────────────────────────
  voice_offline: { en: "🔴 Offline", th: "🔴 ออฟไลน์" },
  voice_online: { en: (n: number, max: string) => `🟢 Online • ${n}${max} players`, th: (n: number, max: string) => `🟢 ออนไลน์ • ${n}${max} คน` },
  field_status: { en: "Status", th: "สถานะ" },
  field_players: { en: "Players", th: "ผู้เล่น" },
  field_day: { en: "Day", th: "วัน" },
  field_season: { en: "Season", th: "ฤดู" },
  field_password: { en: "Password", th: "รหัสผ่าน" },
  field_mode: { en: "Mode", th: "โหมด" },
  field_pvp: { en: "PvP", th: "PvP" },
  field_intention: { en: "Type", th: "ประเภท" },
  field_player_list: { en: "Player list", th: "รายชื่อผู้เล่น" },
  field_uptime: { en: "Uptime", th: "Uptime" },
  day_value: { en: (d: number) => `Day ${d}`, th: (d: number) => `วันที่ ${d}` },
  on: { en: "On", th: "เปิด" },
  off: { en: "Off", th: "ปิด" },
  password_none: { en: "🔓 none", th: "🔓 ไม่มี" },
  last_updated: { en: "last updated", th: "อัปเดตล่าสุด" },
  uptime_hm: { en: (h: number, m: number) => `${h} h ${m} min`, th: (h: number, m: number) => `${h} ชม. ${m} นาที` },
  uptime_m: { en: (m: number) => `${m} min`, th: (m: number) => `${m} นาที` },
  mods_used: { en: (n: number) => `🧩 Mods in use (${n})`, th: (n: number) => `🧩 ม็อดที่ใช้ (${n})` },
  mods_continued: { en: "🧩 Mods (cont.)", th: "🧩 ม็อด (ต่อ)" },
  mods_more: { en: (rest: number) => `… +${rest} mods`, th: (rest: number) => `… +${rest} ม็อด` },

  // ── web server: API responses ──────────────────────────────────
  err_body_too_large: { en: "request body too large", th: "body ใหญ่เกินไป" },
  err_bad_json: { en: "invalid JSON", th: "JSON ไม่ถูกต้อง" },
  err_key_value_string: { en: "key and value must be strings", th: "ต้องมี key และ value เป็น string" },
  setup_saved: { en: "Saved", th: "บันทึกแล้ว" },
  setup_saved_restart: { en: "Saved — restart the bot to apply", th: "บันทึกแล้ว — กด restart bot เพื่อใช้ค่าใหม่" },
  effect_on_restart: { en: "takes effect on server restart", th: "มีผลตอน restart server" },
  bot_not_running: { en: "the bot isn't running", th: "บอทยังไม่ได้รัน" },
  ctrl_start: { en: "start requested", th: "สั่ง start แล้ว" },
  ctrl_stop: { en: "DST server stopped", th: "ปิด DST server แล้ว" },
  ctrl_restart: { en: "DST restarted", th: "รีสตาร์ท DST แล้ว" },
  ctrl_save: { en: (n: number) => `saved (${n} shard${n === 1 ? "" : "s"})`, th: (n: number) => `save แล้ว (${n} shard)` },
  ctrl_no_shard: { en: "no shard is running", th: "ไม่มี shard รัน" },
  ctrl_backup: { en: (f: string) => `backup: ${f}`, th: (f: string) => `backup: ${f}` },
  unsupported_action: { en: (a: string) => `unsupported action: ${a}`, th: (a: string) => `action ไม่รองรับ: ${a}` },

  // ── slash command descriptions (commands.ts) ───────────────────
  cmd_start: { en: "Start the DST server (Master first, then other shards)", th: "เปิด DST server (Master ก่อน แล้ว shard อื่น)" },
  cmd_stop: { en: "Stop the DST server gracefully (saves before shutdown)", th: "ปิด DST server แบบ graceful (save ก่อนปิด)" },
  cmd_restart: { en: "Restart the DST server", th: "รีสตาร์ท DST server" },
  cmd_status: { en: "Show the status of each shard", th: "ดูสถานะแต่ละ shard" },
  cmd_logs: { en: "Show the latest logs of a shard", th: "ดู log ล่าสุดของ shard" },
  cmd_logs_shard: { en: "Shard name (default Master)", th: "ชื่อ shard (default Master)" },
  cmd_logs_lines: { en: "Number of lines (default 20, max 50)", th: "จำนวนบรรทัด (default 20, สูงสุด 50)" },
  cmd_players: { en: "Show players currently online", th: "ดูผู้เล่นที่ออนไลน์อยู่" },
  cmd_mods: { en: "Show mods the server has enabled (from modoverrides.lua)", th: "ดูม็อดที่ server เปิดใช้ (อ่านจาก modoverrides.lua)" },
  cmd_announce: { en: "Broadcast a message to all players", th: "ประกาศข้อความให้ผู้เล่นทุกคน" },
  cmd_announce_message: { en: "The message to broadcast", th: "ข้อความที่จะประกาศ" },
  cmd_save: { en: "Save the world immediately", th: "บันทึกโลกทันที" },
  cmd_rollback: { en: "Roll the world back n saves (irreversible — confirm button + backup first)", th: "ย้อนโลกกลับ n save (ย้อนไม่ได้ — มีปุ่มยืนยัน + backup ก่อน)" },
  cmd_rollback_count: { en: "Number of saves to roll back (default 1, max 5)", th: "จำนวน save ที่จะย้อน (default 1, สูงสุด 5)" },
  cmd_regenerate: { en: "Generate a brand new world (destroys the current save — confirm button + backup first)", th: "สร้างโลกใหม่ทั้งหมด (ทำลายเซฟปัจจุบัน — มีปุ่มยืนยัน + backup ก่อน)" },
  cmd_backup: { en: "Manage cluster save backups", th: "จัดการ backup เซฟของ cluster" },
  cmd_backup_create: { en: "Create a new backup", th: "สร้าง backup ใหม่" },
  cmd_backup_label: { en: "Label appended to the file name (e.g. before-event)", th: "ป้ายกำกับต่อท้ายชื่อไฟล์ (เช่น before-event)" },
  cmd_backup_list: { en: "List available backups", th: "ดูรายการ backup ที่มี" },
  cmd_backup_restore: { en: "Restore a backup over the current world (must /stop first — confirm button)", th: "กู้ backup ทับโลกปัจจุบัน (ต้อง /stop ก่อน — มีปุ่มยืนยัน)" },
  cmd_backup_file: { en: "Backup file name (type to search — has autocomplete)", th: "ชื่อไฟล์ backup (พิมพ์เพื่อค้นหา — มี autocomplete)" },
  cmd_config: { en: "View/edit allowed cluster.ini config (takes effect on restart)", th: "ดู/แก้ config ที่อนุญาตใน cluster.ini (มีผลตอน restart)" },
  cmd_config_show: { en: "Show current config values", th: "แสดงค่า config ปัจจุบัน" },
  cmd_config_set: { en: "Set a config value (whitelisted keys only)", th: "ตั้งค่า config (เฉพาะ key ที่ whitelist)" },
  cmd_config_key: { en: "Key to set", th: "key ที่จะตั้ง" },
  cmd_config_value: { en: "New value", th: "ค่าใหม่" },
} satisfies Record<string, Msg>;

export type MsgKey = keyof typeof MESSAGES;
export type T = (key: MsgKey, ...args: unknown[]) => string;

/** สร้างตัวแปลภาษาสำหรับ lang หนึ่ง ๆ — ใช้ทั้งฝั่ง Discord และ web server */
export function makeT(lang: Lang): T {
  return (key, ...args) => {
    // widen ผ่าน Msg เพื่อรวม signature ฟังก์ชันเป็น rest-param เดียว (กัน TS2556)
    const v = (MESSAGES[key] as Msg)[lang];
    return typeof v === "function" ? v(...args) : v;
  };
}
