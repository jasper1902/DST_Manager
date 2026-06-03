import {
  SlashCommandBuilder,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { whitelistedKeys } from "../dst/clusterConfig.js";

/** กลุ่มคำสั่งที่ถือว่าเป็น "control" — ต้องผ่าน role check */
export const CONTROL_COMMANDS = new Set<string>([
  "start",
  "stop",
  "restart",
  "announce",
  "save",
  "config",
  "rollback",
  "regenerate",
  "backup",
]);

/**
 * นิยาม slash command ทั้งหมด (v1)
 * แยก schema ออกจาก handler เพื่อให้ register.ts กับ bot.ts ใช้ตัวเดียวกัน
 */
export function buildCommands(): RESTPostAPIApplicationCommandsJSONBody[] {
  const configKeyChoices = whitelistedKeys().map((f) => ({
    name: f.key,
    value: f.key,
  }));

  const commands = [
    new SlashCommandBuilder()
      .setName("start")
      .setDescription("เปิด DST server (Master ก่อน แล้ว shard อื่น)"),

    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("ปิด DST server แบบ graceful (save ก่อนปิด)"),

    new SlashCommandBuilder()
      .setName("restart")
      .setDescription("รีสตาร์ท DST server"),

    new SlashCommandBuilder()
      .setName("status")
      .setDescription("ดูสถานะแต่ละ shard"),

    new SlashCommandBuilder()
      .setName("logs")
      .setDescription("ดู log ล่าสุดของ shard")
      .addStringOption((o) =>
        o
          .setName("shard")
          .setDescription("ชื่อ shard (default Master)")
          .setRequired(false),
      )
      .addIntegerOption((o) =>
        o
          .setName("lines")
          .setDescription("จำนวนบรรทัด (default 20, สูงสุด 50)")
          .setMinValue(1)
          .setMaxValue(50)
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("players")
      .setDescription("ดูผู้เล่นที่ออนไลน์อยู่"),

    new SlashCommandBuilder()
      .setName("announce")
      .setDescription("ประกาศข้อความให้ผู้เล่นทุกคน")
      .addStringOption((o) =>
        o
          .setName("message")
          .setDescription("ข้อความที่จะประกาศ")
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("save")
      .setDescription("บันทึกโลกทันที"),

    new SlashCommandBuilder()
      .setName("rollback")
      .setDescription("ย้อนโลกกลับ n save (ย้อนไม่ได้ — มีปุ่มยืนยัน + backup ก่อน)")
      .addIntegerOption((o) =>
        o
          .setName("count")
          .setDescription("จำนวน save ที่จะย้อน (default 1, สูงสุด 5)")
          .setMinValue(1)
          .setMaxValue(5)
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("regenerate")
      .setDescription("สร้างโลกใหม่ทั้งหมด (ทำลายเซฟปัจจุบัน — มีปุ่มยืนยัน + backup ก่อน)"),

    new SlashCommandBuilder()
      .setName("backup")
      .setDescription("จัดการ backup เซฟของ cluster")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("สร้าง backup ใหม่")
          .addStringOption((o) =>
            o
              .setName("label")
              .setDescription("ป้ายกำกับต่อท้ายชื่อไฟล์ (เช่น before-event)")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("ดูรายการ backup ที่มี"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("restore")
          .setDescription("กู้ backup ทับโลกปัจจุบัน (ต้อง /stop ก่อน — มีปุ่มยืนยัน)")
          .addStringOption((o) =>
            o
              .setName("file")
              .setDescription("ชื่อไฟล์ backup (พิมพ์เพื่อค้นหา — มี autocomplete)")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),

    new SlashCommandBuilder()
      .setName("config")
      .setDescription("ดู/แก้ config ที่อนุญาตใน cluster.ini (มีผลตอน restart)")
      .addSubcommand((sub) =>
        sub.setName("show").setDescription("แสดงค่า config ปัจจุบัน"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("ตั้งค่า config (เฉพาะ key ที่ whitelist)")
          .addStringOption((o) => {
            o
              .setName("key")
              .setDescription("key ที่จะตั้ง")
              .setRequired(true);
            for (const c of configKeyChoices) o.addChoices(c);
            return o;
          })
          .addStringOption((o) =>
            o
              .setName("value")
              .setDescription("ค่าใหม่")
              .setRequired(true),
          ),
      ),
  ];

  return commands.map((c) => c.toJSON());
}
