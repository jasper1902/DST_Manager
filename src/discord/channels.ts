import { ChannelType, type Guild } from "discord.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../config.js";

/**
 * provision ห้องที่ bot ต้องใช้เอง (ไม่ต้องให้คนกรอก channel ID):
 *  - category รวมห้องของ bot
 *  - log channel (text) สำหรับ mirror log
 *  - status text channel สำหรับ embed รายละเอียด
 *  - status voice channel ที่ "ชื่อห้อง" = สถานะ + จำนวนผู้เล่น
 *
 * เก็บ ID ที่สร้างไว้ลงไฟล์ state กันสร้างซ้ำตอนรีสตาร์ท — จำเป็นเพราะชื่อ voice
 * channel เปลี่ยนตลอดเวลา จึงหาด้วย "ชื่อ" ไม่ได้ ต้องอ้างด้วย ID ที่ persist ไว้
 */

const STATE_FILE = join(process.cwd(), "channels.json");

/** ชื่อเริ่มต้นของ voice channel ก่อน presence อัปเดตรอบแรก */
const VOICE_INITIAL_NAME = "🔴 ออฟไลน์";

export interface ProvisionedChannels {
  categoryId: string;
  logChannelId: string;
  statusTextChannelId: string;
  statusVoiceChannelId: string;
  controlChannelId: string;
  actionLogChannelId: string;
}

/** state เก็บแยกตาม guild เผื่อ bot ถูกเชิญหลาย guild ในอนาคต */
type ChannelState = Record<string, Partial<ProvisionedChannels>>;

function loadState(): ChannelState {
  try {
    if (!existsSync(STATE_FILE)) return {};
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as ChannelState;
  } catch {
    return {}; // ไฟล์เสีย → เริ่มใหม่ (จะ provision ใหม่ทั้งหมด)
  }
}

/** เขียน state ลงไฟล์เฉพาะเมื่อเนื้อหาเปลี่ยน (กัน --watch restart วนลูป) */
function saveState(state: ChannelState): void {
  const next = `${JSON.stringify(state, null, 2)}\n`;
  try {
    if (existsSync(STATE_FILE) && readFileSync(STATE_FILE, "utf8") === next) return;
    writeFileSync(STATE_FILE, next, "utf8");
    console.log(`[channels] บันทึก channel ID ลง ${STATE_FILE}`);
  } catch (err) {
    console.error("[channels] เขียน state ไม่ได้:", err);
  }
}

/** Discord error code 10003 = Unknown Channel (ห้องถูกลบจริง) */
function isUnknownChannel(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === 10003;
}

type CreatableType =
  | ChannelType.GuildCategory
  | ChannelType.GuildText
  | ChannelType.GuildVoice;

/**
 * คืน ID ของห้องที่ตรง type:
 *  - ถ้า existingId ยังชี้ห้องที่มีอยู่จริงและ type ตรง → ใช้ตัวเดิม
 *  - ไม่งั้นสร้างใหม่
 */
async function ensureChannel(
  guild: Guild,
  existingId: string | undefined,
  type: CreatableType,
  options: { name: string; parent?: string },
): Promise<string> {
  if (existingId) {
    try {
      const ch = await guild.channels.fetch(existingId);
      if (ch && ch.type === type) return ch.id;
      // มีอยู่แต่ type ไม่ตรง (โดนแก้เป็นห้องชนิดอื่น) → สร้างใหม่ด้านล่าง
    } catch (err) {
      // ถูกลบจริง (10003) เท่านั้นถึงสร้างใหม่; error อื่น (เช่น 50001 ขาดสิทธิ์
      // View Channel) แปลว่าห้องน่าจะยังอยู่ → ใช้ ID เดิมต่อ กันสร้างห้องซ้ำ
      if (!isUnknownChannel(err)) {
        console.warn(`[channels] fetch ${existingId} ไม่ได้ — ใช้ ID เดิมต่อ`);
        return existingId;
      }
    }
  }
  const created = await guild.channels.create({
    name: options.name,
    type,
    parent: options.parent,
  });
  console.log(`[channels] สร้างห้อง "${options.name}" (${created.id})`);
  return created.id;
}

/**
 * ทำให้แน่ใจว่าห้องที่ bot ต้องใช้ครบ; สร้างให้ถ้ายังไม่มี
 * bot ต้องมีสิทธิ์ Manage Channels ไม่งั้น create จะ throw (จับไว้ที่ caller)
 */
export async function ensureChannels(
  guild: Guild,
  config: AppConfig,
): Promise<ProvisionedChannels> {
  const state = loadState();
  const saved = state[guild.id] ?? {};

  const categoryId = await ensureChannel(guild, saved.categoryId, ChannelType.GuildCategory, {
    name: config.discord.channelCategory,
  });

  const logChannelId = await ensureChannel(guild, saved.logChannelId, ChannelType.GuildText, {
    name: config.discord.logChannelName,
    parent: categoryId,
  });

  const statusTextChannelId = await ensureChannel(
    guild,
    saved.statusTextChannelId,
    ChannelType.GuildText,
    { name: config.discord.statusTextChannelName, parent: categoryId },
  );

  const statusVoiceChannelId = await ensureChannel(
    guild,
    saved.statusVoiceChannelId,
    ChannelType.GuildVoice,
    { name: VOICE_INITIAL_NAME, parent: categoryId },
  );

  const controlChannelId = await ensureChannel(
    guild,
    saved.controlChannelId,
    ChannelType.GuildText,
    { name: config.discord.controlChannelName, parent: categoryId },
  );

  const actionLogChannelId = await ensureChannel(
    guild,
    saved.actionLogChannelId,
    ChannelType.GuildText,
    { name: config.discord.actionLogChannelName, parent: categoryId },
  );

  const result: ProvisionedChannels = {
    categoryId,
    logChannelId,
    statusTextChannelId,
    statusVoiceChannelId,
    controlChannelId,
    actionLogChannelId,
  };
  state[guild.id] = result;
  saveState(state);

  // status + control = read-only (คนทั่วไปอ่าน/กดปุ่มได้ แต่พิมพ์ไม่ได้; bot ยังโพสต์ได้)
  await lockReadOnly(guild, statusTextChannelId);
  await lockReadOnly(guild, controlChannelId);
  // action log = เห็นเฉพาะ admin role (+ bot)
  await lockAdminOnly(guild, actionLogChannelId, config.discord.adminRoleId);
  return result;
}

/** id ของ bot ใน guild (member ก่อน ไม่งั้น client.user) */
function botId(guild: Guild): string | undefined {
  return guild.members.me?.id ?? guild.client.user?.id;
}

/**
 * read-only: deny SendMessages/threads ของ @everyone แต่ allow bot ส่งได้
 * (channel overwrite ชนะ guild role perms) — ต้องมีสิทธิ์ Manage Roles
 */
async function lockReadOnly(guild: Guild, channelId: string): Promise<void> {
  try {
    const ch = await guild.channels.fetch(channelId);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    await ch.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    });

    const me = botId(guild);
    if (me) {
      await ch.permissionOverwrites.edit(me, {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
      });
    }
  } catch (err) {
    warnPerm("read-only", err);
  }
}

/**
 * admin-only: deny ViewChannel ของ @everyone, allow เฉพาะ admin role + bot
 * ถ้าไม่ได้ตั้ง adminRoleId → ปล่อยเห็นได้ทุกคน (เตือน)
 */
async function lockAdminOnly(
  guild: Guild,
  channelId: string,
  adminRoleId: string | undefined,
): Promise<void> {
  if (!adminRoleId) {
    console.warn("[channels] ไม่ได้ตั้ง DISCORD_ADMIN_ROLE_ID → ห้อง action log เห็นได้ทุกคน");
    return;
  }
  try {
    const ch = await guild.channels.fetch(channelId);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    await ch.permissionOverwrites.edit(adminRoleId, { ViewChannel: true });
    const me = botId(guild);
    if (me) {
      await ch.permissionOverwrites.edit(me, { ViewChannel: true, SendMessages: true });
    }
  } catch (err) {
    warnPerm("admin-only", err);
  }
}

function warnPerm(kind: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(
    `[channels] ตั้ง permission (${kind}) ไม่ได้ (ต้องมีสิทธิ์ Manage Roles หรือปรับเองใน Discord): ${msg}`,
  );
}
