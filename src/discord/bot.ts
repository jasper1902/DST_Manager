import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ComponentType,
  GatewayIntentBits,
  MessageFlags,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type Interaction,
  type User,
} from "discord.js";
import type { AppConfig } from "../config.js";
import { formatSize } from "../dst/backup.js";
import { setConfig, showConfig, WHITELIST } from "../dst/clusterConfig.js";
import type { DSTManager, ManagerCrashEvent } from "../dst/manager.js";
import { ensureChannels, type ProvisionedChannels } from "./channels.js";
import { CONTROL_COMMANDS } from "./commands.js";
import { ensureControlPanel } from "./controlPanel.js";
import { ServerStatusPresence } from "./statusPresence.js";

/** key ที่ถือว่าอ่อนไหว → ปิดค่าเวลาตอบกลับ */
const SENSITIVE_KEYS = new Set<string>(["cluster_password"]);

/** ตัด string ให้พอดี code block ของ Discord (limit 2000 ต่อ message) */
function fitCodeBlock(text: string, max = 1900): string {
  const body = text.length > max ? text.slice(text.length - max) : text;
  return "```\n" + body + "\n```";
}

const STATE_ICON: Record<string, string> = {
  running: "🟢",
  starting: "🟡",
  stopping: "🟠",
  stopped: "🔴",
};

/**
 * สร้าง Discord bot ที่เป็นแค่ adapter บาง ๆ ครอบ DSTManager
 * map interaction -> เรียก manager แล้วฟอร์แมตผลกลับ; ไม่มี business logic เอง
 */
export function createBot(config: AppConfig, manager: DSTManager): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // ห้องที่ provision เสร็จหลัง ready — handler ปิด closure อ่านค่านี้ (null จนกว่าจะพร้อม)
  let channels: ProvisionedChannels | null = null;

  client.once("clientReady", (c) => {
    console.log(`✓ Logged in as ${c.user.tag}`);
    void provisionAndStart(c, config, manager, (ch) => {
      channels = ch;
    });
  });

  client.on("interactionCreate", (interaction: Interaction) => {
    if (interaction.isAutocomplete()) {
      void handleAutocomplete(interaction, manager);
      return;
    }
    if (interaction.isButton()) {
      void handleButton(interaction, config, manager, channels);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    void handleCommand(interaction, config, manager, channels);
  });

  return client;
}

/**
 * หลัง login: สร้างห้องที่ bot ต้องใช้ (log + status text + status voice)
 * แล้วผูก log mirror กับ status presence เข้ากับห้องที่ได้
 * bot ต้องมีสิทธิ์ Manage Channels — ถ้าไม่มี ขั้นนี้จะ throw แล้ว log เตือน
 */
async function provisionAndStart(
  client: Client,
  config: AppConfig,
  manager: DSTManager,
  onReady: (channels: ProvisionedChannels) => void,
): Promise<void> {
  try {
    const guild = await client.guilds.fetch(config.discord.guildId);
    const channels = await ensureChannels(guild, config);
    onReady(channels); // ให้ interaction handler ใช้ได้ทันที

    await ensureControlPanel(client, channels.controlChannelId);
    console.log(`✓ Control panel: ห้อง ${channels.controlChannelId}`);

    attachLogMirror(client, manager, channels.logChannelId);
    console.log(`✓ Log mirror: ห้อง ${channels.logChannelId}`);

    // แจ้งเตือนเมื่อ shard ล่มเอง (crash) → ping admin ในห้อง log
    manager.on("crash", (e: ManagerCrashEvent) => {
      void sendCrashAlert(client, config, channels.logChannelId, e);
    });

    const presence = new ServerStatusPresence(
      client,
      manager,
      config,
      channels.statusVoiceChannelId,
      channels.statusTextChannelId,
    );
    presence.start();
    console.log(
      `✓ Status presence: voice ${channels.statusVoiceChannelId} (ชื่อห้องทุก ${config.status.nameIntervalSec}s) ` +
        `+ text ${channels.statusTextChannelId} (embed ทุก ${config.status.messageIntervalSec}s)`,
    );
  } catch (err) {
    console.error(
      "✗ สร้าง/เข้าถึงห้องไม่ได้ — ตรวจว่า bot มีสิทธิ์ Manage Channels และอยู่ใน guild:",
      err,
    );
  }
}

/** ตรวจ role: ถ้าไม่ได้ตั้ง adminRoleId → ผ่านหมด (เหมาะกับ dev เท่านั้น) */
async function isAuthorized(
  guild: Guild | null,
  userId: string,
  adminRoleId: string | undefined,
): Promise<boolean> {
  if (!adminRoleId) return true;
  if (!guild) return false;
  try {
    const member = await guild.members.fetch(userId);
    return member.roles.cache.has(adminRoleId);
  } catch {
    return false;
  }
}

/** บันทึกว่าใครใช้คำสั่ง/ปุ่มอะไร ลงห้อง action log (ไม่ ping ผู้ใช้) */
async function logAction(
  client: Client,
  channels: ProvisionedChannels | null,
  user: User,
  action: string,
): Promise<void> {
  if (!channels) return;
  try {
    const ch = await client.channels.fetch(channels.actionLogChannelId);
    if (ch?.isTextBased() && ch.isSendable()) {
      const ts = Math.floor(Date.now() / 1000);
      await ch.send({
        content: `🕹️ <@${user.id}> (\`${user.username}\`) → **${action}** • <t:${ts}:f>`,
        allowedMentions: { parse: [] },
      });
    }
  } catch {
    // ไม่ให้ action log ทำ bot ล้ม
  }
}

/** สรุปคำสั่งเป็นข้อความสั้น (ไม่ใส่ค่า option กันรั่ว เช่น cluster_password) */
function summarizeCommand(interaction: ChatInputCommandInteraction): string {
  const sub = interaction.options.getSubcommand(false);
  return sub ? `/${interaction.commandName} ${sub}` : `/${interaction.commandName}`;
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
  manager: DSTManager,
  channels: ProvisionedChannels | null,
): Promise<void> {
  const name = interaction.commandName;

  // role check สำหรับกลุ่ม control
  if (CONTROL_COMMANDS.has(name)) {
    const ok = await isAuthorized(interaction.guild, interaction.user.id, config.discord.adminRoleId);
    if (!ok) {
      await logAction(interaction.client, channels, interaction.user, `❌ ${summarizeCommand(interaction)} (ไม่มีสิทธิ์)`);
      await interaction.reply({
        content: "❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  void logAction(interaction.client, channels, interaction.user, summarizeCommand(interaction));

  try {
    switch (name) {
      case "start":
        return await cmdStart(interaction, manager);
      case "stop":
        return await cmdStop(interaction, manager);
      case "restart":
        return await cmdRestart(interaction, manager);
      case "status":
        return await cmdStatus(interaction, manager);
      case "logs":
        return await cmdLogs(interaction, manager);
      case "players":
        return await cmdPlayers(interaction, manager);
      case "announce":
        return await cmdAnnounce(interaction, manager);
      case "save":
        return await cmdSave(interaction, manager);
      case "rollback":
        return await cmdRollback(interaction, manager);
      case "regenerate":
        return await cmdRegenerate(interaction, manager);
      case "backup":
        return await cmdBackup(interaction, manager);
      case "config":
        return await cmdConfig(interaction, config, manager);
      default:
        await interaction.reply({
          content: `ไม่รู้จักคำสั่ง: ${name}`,
          flags: MessageFlags.Ephemeral,
        });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const content = `⚠️ เกิดข้อผิดพลาด: ${msg}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * autocomplete: เฉพาะ /backup restore option "file" — เสนอชื่อไฟล์ backup ที่ตรง query
 * ต้อง respond ภายใน 3 วินาที, ส่งได้สูงสุด 25 choice (name/value ≤ 100 ตัว)
 */
async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  manager: DSTManager,
): Promise<void> {
  if (interaction.commandName !== "backup") return;
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "file") {
    await interaction.respond([]).catch(() => {});
    return;
  }

  const query = focused.value.toLowerCase();
  const choices = manager
    .listBackups()
    .filter((b) => b.file.toLowerCase().includes(query))
    .filter((b) => b.file.length <= 100) // value เกิน 100 Discord ไม่รับ → restore ไม่ได้อยู่ดี
    .slice(0, 25)
    .map((b) => ({
      name: `${b.file} (${formatSize(b.size)})`.slice(0, 100),
      value: b.file,
    }));

  await interaction.respond(choices).catch(() => {
    // เกิน 3 วิ / token หมดอายุ — ปล่อยผ่าน ไม่ให้ล้ม
  });
}

// ── control panel buttons ───────────────────────────────────────────────

/**
 * จัดการปุ่ม control panel (customId ขึ้นต้น "ctrl:") — ปุ่ม confirm/cancel
 * ปล่อยให้ collector ใน confirmAndRun รับเอง ทุกปุ่มต้องมีสิทธิ์ admin role
 */
async function handleButton(
  interaction: ButtonInteraction,
  config: AppConfig,
  manager: DSTManager,
  channels: ProvisionedChannels | null,
): Promise<void> {
  if (!interaction.customId.startsWith("ctrl:")) return;
  const action = interaction.customId.slice("ctrl:".length);

  const ok = await isAuthorized(interaction.guild, interaction.user.id, config.discord.adminRoleId);
  if (!ok) {
    await logAction(interaction.client, channels, interaction.user, `❌ [ปุ่ม] ${action} (ไม่มีสิทธิ์)`);
    await interaction.reply({ content: "❌ คุณไม่มีสิทธิ์ใช้ปุ่มนี้", flags: MessageFlags.Ephemeral });
    return;
  }

  void logAction(interaction.client, channels, interaction.user, `[ปุ่ม] ${action}`);

  try {
    await runControlAction(interaction, manager, action);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const content = `⚠️ เกิดข้อผิดพลาด: ${msg}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

/** map ปุ่ม → เรียก manager (ตอบแบบ ephemeral เสมอ ห้อง control จะได้ไม่รก) */
async function runControlAction(
  interaction: ButtonInteraction,
  manager: DSTManager,
  action: string,
): Promise<void> {
  switch (action) {
    case "start":
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await manager.start();
      return void (await interaction.editReply("🟢 สั่ง start แล้ว"));
    case "stop":
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await manager.stop();
      return void (await interaction.editReply("🔴 ปิด server เรียบร้อย (save ก่อนปิด)"));
    case "restart":
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await manager.restart();
      return void (await interaction.editReply("🔄 รีสตาร์ทเรียบร้อย"));
    case "save": {
      const n = manager.save();
      return void (await interaction.reply({
        content: n ? `💾 สั่ง save แล้ว (${n} shard)` : "⚠️ ไม่มี shard ที่กำลังรัน",
        flags: MessageFlags.Ephemeral,
      }));
    }
    case "backup": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const info = await manager.backup();
      return void (await interaction.editReply(
        `💾 backup: \`${info.file}\` (${formatSize(info.size)})`,
      ));
    }
    case "status": {
      const lines = manager.status().map((s) => {
        const icon = STATE_ICON[s.state] ?? "⚪";
        const pid = s.pid !== undefined ? ` (pid ${s.pid})` : "";
        return `${icon} **${s.shard}**: ${s.state}${pid}`;
      });
      return void (await interaction.reply({
        content: lines.join("\n") || "—",
        flags: MessageFlags.Ephemeral,
      }));
    }
    case "players": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const players = await manager.listPlayers();
      const body = players.length
        ? `👥 ผู้เล่นออนไลน์ (${players.length})\n${players.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
        : "ไม่มีผู้เล่นออนไลน์ (หรือ server ไม่ได้รัน)";
      return void (await interaction.editReply(body));
    }
    default:
      return void (await interaction.reply({
        content: `ไม่รู้จักปุ่ม: ${action}`,
        flags: MessageFlags.Ephemeral,
      }));
  }
}

// ── handlers ──────────────────────────────────────────────────────────

async function cmdStart(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  await interaction.deferReply();
  await manager.start();
  await interaction.editReply("🟢 สั่ง start แล้ว (Master ก่อน แล้ว shard อื่น)");
}

async function cmdStop(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  await interaction.deferReply();
  await manager.stop();
  await interaction.editReply("🔴 ปิด server เรียบร้อย (save ก่อนปิด)");
}

async function cmdRestart(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  await interaction.deferReply();
  await manager.restart();
  await interaction.editReply("🔄 รีสตาร์ทเรียบร้อย");
}

async function cmdStatus(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  const lines = manager.status().map((s) => {
    const icon = STATE_ICON[s.state] ?? "⚪";
    const pid = s.pid !== undefined ? ` (pid ${s.pid})` : "";
    return `${icon} **${s.shard}**: ${s.state}${pid}`;
  });
  await interaction.reply(lines.join("\n"));
}

async function cmdLogs(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  const shard = interaction.options.getString("shard") ?? "Master";
  const lines = interaction.options.getInteger("lines") ?? 20;
  const log = manager.logs(shard, lines);
  const body = log.length ? log.join("\n") : "(ยังไม่มี log)";
  await interaction.reply({
    content: `**${shard}** — ${log.length} บรรทัดล่าสุด\n${fitCodeBlock(body)}`,
  });
}

async function cmdPlayers(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  await interaction.deferReply();
  const players = await manager.listPlayers();
  if (players.length === 0) {
    await interaction.editReply("ไม่มีผู้เล่นออนไลน์ (หรือ server ไม่ได้รัน)");
    return;
  }
  const list = players.map((p, i) => `${i + 1}. ${p}`).join("\n");
  await interaction.editReply(`👥 ผู้เล่นออนไลน์ (${players.length})\n${list}`);
}

async function cmdAnnounce(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  const message = interaction.options.getString("message", true);
  const sent = manager.announce(message);
  if (sent === 0) {
    await interaction.reply({
      content: "⚠️ ไม่มี shard ที่กำลังรัน — ประกาศไม่ออก",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply(`📢 ประกาศแล้ว (${sent} shard): ${message}`);
}

async function cmdSave(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  const sent = manager.save();
  if (sent === 0) {
    await interaction.reply({
      content: "⚠️ ไม่มี shard ที่กำลังรัน",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply(`💾 สั่ง save แล้ว (${sent} shard)`);
}

// ── destructive ops (ยืนยันด้วยปุ่มก่อนทำ + backup อัตโนมัติ) ────────────

/** ยังไม่มี shard รัน → ตอบ ephemeral แล้วคืน false (caller หยุด) */
async function requireRunning(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  action: string,
): Promise<boolean> {
  if (manager.status().some((s) => s.running)) return true;
  await interaction.reply({
    content: `⚠️ server ไม่ได้รันอยู่ — ${action} ไม่ได้`,
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

/**
 * แสดงปุ่ม ยืนยัน/ยกเลิก (ephemeral) รอ 30 วินาที
 * กดยืนยัน → เรียก run() แล้วแก้ข้อความเป็นผลลัพธ์; ไม่กด/ยกเลิก → ปิดเงียบ
 */
async function confirmAndRun(
  interaction: ChatInputCommandInteraction,
  warning: string,
  run: () => Promise<string>,
): Promise<void> {
  const confirmId = `confirm:${interaction.id}`;
  const cancelId = `cancel:${interaction.id}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel("ยืนยัน").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(cancelId).setLabel("ยกเลิก").setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    content: warning,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
  const msg = await interaction.fetchReply();

  try {
    const click = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === interaction.user.id,
    });
    if (click.customId !== confirmId) {
      await click.update({ content: "❌ ยกเลิกแล้ว", components: [] });
      return;
    }
    await click.update({ content: "⏳ กำลังดำเนินการ...", components: [] });
    const result = await run();
    await interaction.editReply({ content: result, components: [] });
  } catch (err) {
    // timeout (ไม่กดอะไร) หรือ run() พัง
    const isTimeout = err instanceof Error && err.message.includes("time");
    const content = isTimeout
      ? "⌛ หมดเวลายืนยัน — ยกเลิกอัตโนมัติ"
      : `⚠️ ล้มเหลว: ${err instanceof Error ? err.message : String(err)}`;
    await interaction.editReply({ content, components: [] }).catch(() => {});
  }
}

async function cmdRollback(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  if (!(await requireRunning(interaction, manager, "rollback"))) return;
  const count = interaction.options.getInteger("count") ?? 1;
  await confirmAndRun(
    interaction,
    `⚠️ **Rollback ${count} save** — ย้อนโลกกลับ ความคืบหน้าหลังจุดนั้นจะหาย\n` +
      `ระบบจะ backup ปัจจุบันก่อนอัตโนมัติ — กด "ยืนยัน" ภายใน 30 วินาที`,
    async () => {
      const info = await manager.backup("pre-rollback");
      manager.rollback(count);
      return `↩️ rollback ${count} save แล้ว\n💾 backup ก่อนหน้า: \`${info.file}\``;
    },
  );
}

async function cmdRegenerate(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  if (!(await requireRunning(interaction, manager, "regenerate"))) return;
  await confirmAndRun(
    interaction,
    "🔥 **Regenerate world** — สร้างโลกใหม่ทั้งหมด เซฟปัจจุบันจะถูกทำลายถาวร\n" +
      'ระบบจะ backup ปัจจุบันก่อนอัตโนมัติ — กด "ยืนยัน" ภายใน 30 วินาที',
    async () => {
      const info = await manager.backup("pre-regenerate");
      manager.regenerateWorld();
      return `🌱 สั่ง regenerate world แล้ว\n💾 backup ก่อนหน้า: \`${info.file}\``;
    },
  );
}

async function cmdBackup(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    await interaction.deferReply();
    const label = interaction.options.getString("label") ?? undefined;
    const info = await manager.backup(label);
    await interaction.editReply(
      `💾 backup สำเร็จ: \`${info.file}\` (${formatSize(info.size)})`,
    );
    return;
  }

  if (sub === "list") {
    const list = manager.listBackups();
    if (list.length === 0) {
      await interaction.reply("ยังไม่มี backup — ใช้ `/backup create` สร้างได้");
      return;
    }
    const body = list
      .slice(0, 20)
      .map(
        (b, i) =>
          `${i + 1}. \`${b.file}\` — ${formatSize(b.size)} — ${b.mtime.toLocaleString()}`,
      )
      .join("\n");
    await interaction.reply(`💾 backup ล่าสุด (${list.length})\n${body}`);
    return;
  }

  // restore — ต้องหยุด server ก่อน + ยืนยัน
  const file = interaction.options.getString("file", true);
  if (manager.status().some((s) => s.running)) {
    await interaction.reply({
      content: "⚠️ ต้อง `/stop` ให้ server หยุดก่อนถึงจะ restore ได้",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await confirmAndRun(
    interaction,
    `⚠️ **Restore** \`${file}\` ทับโลกปัจจุบัน — สถานะปัจจุบันจะถูกเขียนทับ\n` +
      'กด "ยืนยัน" ภายใน 30 วินาที',
    async () => {
      await manager.restore(file);
      return `✓ restore \`${file}\` แล้ว — ใช้ \`/start\` เพื่อเปิด server`;
    },
  );
}

async function cmdConfig(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
  manager: DSTManager,
): Promise<void> {
  // config อ่อนไหว (password) → ตอบแบบ ephemeral เสมอ
  const sub = interaction.options.getSubcommand();

  if (sub === "show") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const values = await showConfig(config.dst);
    const body = values
      .map((v) => {
        const shown = SENSITIVE_KEYS.has(v.key) && v.value !== "(unset)" ? "•••" : v.value;
        return `${v.key} = ${shown}`;
      })
      .join("\n");
    await interaction.editReply(fitCodeBlock(body));
    return;
  }

  if (sub === "set") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const key = interaction.options.getString("key", true);
    const value = interaction.options.getString("value", true);
    const result = await setConfig(config.dst, key, value);
    const shown = SENSITIVE_KEYS.has(result.key) ? "•••" : result.value;
    await interaction.editReply(
      `✓ ตั้งค่า \`${result.key}\` = \`${shown}\`\n⚠️ มีผลหลัง /restart`,
    );
    return;
  }

  // unreachable แต่กัน type
  await interaction.reply({
    content: `subcommand ไม่รองรับ: ${sub}`,
    flags: MessageFlags.Ephemeral,
  });
  void WHITELIST;
}

// ── crash alert ──────────────────────────────────────────────────────────

/** ส่งข้อความเตือน crash เข้าห้อง log พร้อม ping admin role (ถ้าตั้งไว้) */
async function sendCrashAlert(
  client: Client,
  config: AppConfig,
  channelId: string,
  e: ManagerCrashEvent,
): Promise<void> {
  const roleId = config.discord.adminRoleId;
  const ping = roleId ? `<@&${roleId}> ` : "";
  const text = e.restarting
    ? `${ping}⚠️ shard **${e.shard}** ล่ม (exit ${e.code ?? "?"}) — กำลัง restart อัตโนมัติ`
    : `${ping}🛑 shard **${e.shard}** ล่มซ้ำหลายครั้งในเวลาสั้น ๆ — หยุด auto-restart แล้ว ต้องเข้าไปตรวจเอง`;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased() && channel.isSendable()) {
      await channel.send({
        content: text,
        allowedMentions: { roles: roleId ? [roleId] : [] },
      });
    }
  } catch {
    // ไม่ให้ crash alert ทำ bot ล้ม
  }
}

// ── log mirror ──────────────────────────────────────────────────────────

/** buffer log lines แล้ว flush เป็นก้อนเข้า channel ทุก ๆ ช่วง กัน rate limit */
function attachLogMirror(
  client: Client,
  manager: DSTManager,
  channelId: string,
): void {
  const FLUSH_MS = 2_000;
  let pending: string[] = [];

  manager.on("line", (e: { shard: string; line: string }) => {
    pending.push(`[${e.shard}] ${e.line}`);
  });

  setInterval(() => {
    void (async () => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel?.isTextBased() && channel.isSendable()) {
          await channel.send(fitCodeBlock(batch.join("\n")));
        }
      } catch {
        // ไม่ให้ log mirror ทำ bot ล้ม
      }
    })();
  }, FLUSH_MS).unref();
}
