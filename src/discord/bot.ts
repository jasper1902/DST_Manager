import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ComponentType,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type Interaction,
  type ModalSubmitInteraction,
  type RepliableInteraction,
  type User,
} from "discord.js";
import type { AppConfig } from "../config.js";
import { formatSize } from "../dst/backup.js";
import { setConfig, showConfig, WHITELIST } from "../dst/clusterConfig.js";
import { makeT, type T } from "../i18n.js";
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
    if (interaction.isModalSubmit()) {
      void handleModal(interaction, config, manager, channels);
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

    await ensureControlPanel(client, channels.controlChannelId, config.language);
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
  const t = makeT(config.language);

  // role check สำหรับกลุ่ม control
  if (CONTROL_COMMANDS.has(name)) {
    const ok = await isAuthorized(interaction.guild, interaction.user.id, config.discord.adminRoleId);
    if (!ok) {
      await logAction(interaction.client, channels, interaction.user, `❌ ${summarizeCommand(interaction)} ${t("no_perm_suffix")}`);
      await interaction.reply({
        content: t("cmd_no_permission"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  void logAction(interaction.client, channels, interaction.user, summarizeCommand(interaction));

  try {
    switch (name) {
      case "start":
        return await cmdStart(interaction, manager, t);
      case "stop":
        return await cmdStop(interaction, manager, t);
      case "restart":
        return await cmdRestart(interaction, manager, t);
      case "status":
        return await cmdStatus(interaction, manager);
      case "logs":
        return await cmdLogs(interaction, manager, t);
      case "players":
        return await cmdPlayers(interaction, manager, t);
      case "mods":
        return await cmdMods(interaction, manager, t);
      case "announce":
        return await cmdAnnounce(interaction, manager, t);
      case "save":
        return await cmdSave(interaction, manager, t);
      case "rollback":
        return await cmdRollback(interaction, manager, t);
      case "regenerate":
        return await cmdRegenerate(interaction, manager, t);
      case "backup":
        return await cmdBackup(interaction, manager, t);
      case "config":
        return await cmdConfig(interaction, config, manager, t);
      default:
        await interaction.reply({
          content: t("unknown_command", name),
          flags: MessageFlags.Ephemeral,
        });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const content = t("error_occurred", msg);
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
  const t = makeT(config.language);

  const ok = await isAuthorized(interaction.guild, interaction.user.id, config.discord.adminRoleId);
  if (!ok) {
    await logAction(interaction.client, channels, interaction.user, `❌ ${t("button_prefix")} ${action} ${t("no_perm_suffix")}`);
    await interaction.reply({ content: t("btn_no_permission"), flags: MessageFlags.Ephemeral });
    return;
  }

  void logAction(interaction.client, channels, interaction.user, `${t("button_prefix")} ${action}`);

  try {
    await runControlAction(interaction, config, manager, action, t);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const content = t("error_occurred", msg);
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

/** map ปุ่ม → เรียก manager (ตอบแบบ ephemeral เสมอ ห้อง control จะได้ไม่รก) */
async function runControlAction(
  interaction: ButtonInteraction,
  config: AppConfig,
  manager: DSTManager,
  action: string,
  t: T,
): Promise<void> {
  switch (action) {
    case "start":
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await manager.start();
      return void (await interaction.editReply(t("start_done_short")));
    case "stop":
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await manager.stop();
      return void (await interaction.editReply(t("stop_done")));
    case "restart":
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await manager.restart();
      return void (await interaction.editReply(t("restart_done")));
    case "save": {
      const n = manager.save();
      return void (await interaction.reply({
        content: n ? t("save_done", n) : t("no_shard_running"),
        flags: MessageFlags.Ephemeral,
      }));
    }
    case "backup": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const info = await manager.backup();
      return void (await interaction.editReply(t("backup_short", info.file, formatSize(info.size))));
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
        ? `${t("players_online", players.length)}\n${players.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
        : t("no_players");
      return void (await interaction.editReply(body));
    }
    case "mods": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const mods = await manager.getMods();
      if (mods === null) return void (await interaction.editReply(t("mods_no_file")));
      if (mods.length === 0) return void (await interaction.editReply(t("mods_none_enabled")));
      const on = mods.filter((m) => m.enabled).length;
      const lines = mods.map((m) => `${m.enabled ? "🟢" : "⚪"} [${m.name}](${m.url})`);
      const chunks = chunkLines(lines, 1900);
      return void (await interaction.editReply(`${t("mods_header", on, mods.length)}\n${chunks[0] ?? "—"}`));
    }
    case "logs": {
      const log = manager.logs("Master", 20);
      const body = log.length ? log.join("\n") : t("no_logs");
      return void (await interaction.reply({
        content: `${t("logs_header", "Master", log.length)}\n${fitCodeBlock(body)}`,
        flags: MessageFlags.Ephemeral,
      }));
    }
    case "config": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const values = await showConfig(config.dst);
      const body = values
        .map((v) => `${v.key} = ${SENSITIVE_KEYS.has(v.key) && v.value !== "(unset)" ? "•••" : v.value}`)
        .join("\n");
      return void (await interaction.editReply(fitCodeBlock(body)));
    }
    case "announce":
      return void (await interaction.showModal(buildAnnounceModal(t)));
    case "configset":
      return void (await interaction.showModal(buildConfigSetModal(t)));
    case "rollback":
      return await doRollback(interaction, manager, t, 1);
    case "regenerate":
      return await doRegenerate(interaction, manager, t);
    default:
      return void (await interaction.reply({
        content: t("unknown_button", action),
        flags: MessageFlags.Ephemeral,
      }));
  }
}

// ── modals (ปุ่มที่ต้องกรอกค่า: announce, config set) ─────────────────────

function buildAnnounceModal(t: T): ModalBuilder {
  return new ModalBuilder().setCustomId("modal:announce").setTitle(t("modal_announce_title")).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("message")
        .setLabel(t("modal_announce_field"))
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(256)
        .setRequired(true),
    ),
  );
}

function buildConfigSetModal(t: T): ModalBuilder {
  return new ModalBuilder().setCustomId("modal:configset").setTitle(t("modal_configset_title")).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("key").setLabel(t("modal_configset_key")).setStyle(TextInputStyle.Short).setRequired(true),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("value").setLabel(t("modal_configset_value")).setStyle(TextInputStyle.Short).setRequired(true),
    ),
  );
}

/** จัดการ modal submit (announce / config set) — เช็คสิทธิ์ซ้ำ (interaction แยกจากปุ่ม) */
async function handleModal(
  interaction: ModalSubmitInteraction,
  config: AppConfig,
  manager: DSTManager,
  channels: ProvisionedChannels | null,
): Promise<void> {
  if (!interaction.customId.startsWith("modal:")) return;
  const kind = interaction.customId.slice("modal:".length);
  const t = makeT(config.language);

  const ok = await isAuthorized(interaction.guild, interaction.user.id, config.discord.adminRoleId);
  if (!ok) {
    await interaction.reply({ content: t("btn_no_permission"), flags: MessageFlags.Ephemeral });
    return;
  }
  void logAction(interaction.client, channels, interaction.user, `${t("button_prefix")} ${kind}`);

  try {
    if (kind === "announce") {
      const message = interaction.fields.getTextInputValue("message");
      const sent = manager.announce(message);
      await interaction.reply(
        sent === 0
          ? { content: t("announce_none"), flags: MessageFlags.Ephemeral }
          : { content: t("announce_done", sent, message) },
      );
      return;
    }
    if (kind === "configset") {
      const key = interaction.fields.getTextInputValue("key").trim();
      const value = interaction.fields.getTextInputValue("value");
      const result = await setConfig(config.dst, key, value);
      const shown = SENSITIVE_KEYS.has(result.key) ? "•••" : result.value;
      await interaction.reply({ content: t("config_set", result.key, shown), flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: t("unknown_button", kind), flags: MessageFlags.Ephemeral });
  } catch (err: unknown) {
    const content = t("error_occurred", err instanceof Error ? err.message : String(err));
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

// ── handlers ──────────────────────────────────────────────────────────

async function cmdStart(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  await interaction.deferReply();
  await manager.start();
  await interaction.editReply(t("start_done"));
}

async function cmdStop(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  await interaction.deferReply();
  await manager.stop();
  await interaction.editReply(t("stop_done"));
}

async function cmdRestart(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  await interaction.deferReply();
  await manager.restart();
  await interaction.editReply(t("restart_done"));
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
  t: T,
): Promise<void> {
  const shard = interaction.options.getString("shard") ?? "Master";
  const lines = interaction.options.getInteger("lines") ?? 20;
  const log = manager.logs(shard, lines);
  const body = log.length ? log.join("\n") : t("no_logs");
  await interaction.reply({
    content: `${t("logs_header", shard, log.length)}\n${fitCodeBlock(body)}`,
  });
}

async function cmdPlayers(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  await interaction.deferReply();
  const players = await manager.listPlayers();
  if (players.length === 0) {
    await interaction.editReply(t("no_players"));
    return;
  }
  const list = players.map((p, i) => `${i + 1}. ${p}`).join("\n");
  await interaction.editReply(`${t("players_online", players.length)}\n${list}`);
}

async function cmdMods(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  // resolve ชื่อม็อดยิง Steam API → อาจช้า → defer ก่อน
  await interaction.deferReply();
  const mods = await manager.getMods();
  if (mods === null) {
    await interaction.editReply(t("mods_no_file"));
    return;
  }
  if (mods.length === 0) {
    await interaction.editReply(t("mods_none_enabled"));
    return;
  }
  const on = mods.filter((m) => m.enabled).length;
  const lines = mods.map((m) => `${m.enabled ? "🟢" : "⚪"} [${m.name}](${m.url})`);

  // รายการม็อดอาจยาวเกิน 2000 ตัว/ข้อความ → แบ่งส่งหลายก้อน
  const chunks = chunkLines(lines, 1900);
  const header = t("mods_header", on, mods.length);
  await interaction.editReply(`${header}\n${chunks[0] ?? "—"}`);
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp(chunk);
  }
}

/** รวมบรรทัดเป็นก้อนละไม่เกิน max ตัวอักษร (ไม่ตัดกลางบรรทัด) */
function chunkLines(lines: string[], max: number): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur && cur.length + 1 + line.length > max) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function cmdAnnounce(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  const message = interaction.options.getString("message", true);
  const sent = manager.announce(message);
  if (sent === 0) {
    await interaction.reply({
      content: t("announce_none"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply(t("announce_done", sent, message));
}

async function cmdSave(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  const sent = manager.save();
  if (sent === 0) {
    await interaction.reply({
      content: t("no_shard_running"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply(t("save_done", sent));
}

// ── destructive ops (ยืนยันด้วยปุ่มก่อนทำ + backup อัตโนมัติ) ────────────

/** ยังไม่มี shard รัน → ตอบ ephemeral แล้วคืน false (caller หยุด) */
async function requireRunning(
  interaction: RepliableInteraction,
  manager: DSTManager,
  action: string,
  t: T,
): Promise<boolean> {
  if (manager.status().some((s) => s.running)) return true;
  await interaction.reply({
    content: t("server_not_running_action", action),
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

/**
 * แสดงปุ่ม ยืนยัน/ยกเลิก (ephemeral) รอ 30 วินาที
 * กดยืนยัน → เรียก run() แล้วแก้ข้อความเป็นผลลัพธ์; ไม่กด/ยกเลิก → ปิดเงียบ
 */
async function confirmAndRun(
  interaction: RepliableInteraction,
  t: T,
  warning: string,
  run: () => Promise<string>,
): Promise<void> {
  const confirmId = `confirm:${interaction.id}`;
  const cancelId = `cancel:${interaction.id}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel(t("confirm")).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(cancelId).setLabel(t("cancel")).setStyle(ButtonStyle.Secondary),
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
      await click.update({ content: t("cancelled"), components: [] });
      return;
    }
    await click.update({ content: t("processing"), components: [] });
    const result = await run();
    await interaction.editReply({ content: result, components: [] });
  } catch (err) {
    // timeout (ไม่กดอะไร) หรือ run() พัง
    const isTimeout = err instanceof Error && err.message.includes("time");
    const content = isTimeout
      ? t("confirm_timeout")
      : t("failed", err instanceof Error ? err.message : String(err));
    await interaction.editReply({ content, components: [] }).catch(() => {});
  }
}

/** rollback (ใช้ร่วมทั้ง slash + ปุ่ม) — เช็ค running + ยืนยัน + backup ก่อน */
async function doRollback(
  interaction: RepliableInteraction,
  manager: DSTManager,
  t: T,
  count: number,
): Promise<void> {
  if (!(await requireRunning(interaction, manager, "rollback", t))) return;
  await confirmAndRun(interaction, t, t("rollback_warning", count), async () => {
    const info = await manager.backup("pre-rollback");
    manager.rollback(count);
    return t("rollback_done", count, info.file);
  });
}

/** regenerate world (ใช้ร่วมทั้ง slash + ปุ่ม) */
async function doRegenerate(interaction: RepliableInteraction, manager: DSTManager, t: T): Promise<void> {
  if (!(await requireRunning(interaction, manager, "regenerate", t))) return;
  await confirmAndRun(interaction, t, t("regenerate_warning"), async () => {
    const info = await manager.backup("pre-regenerate");
    manager.regenerateWorld();
    return t("regenerate_done", info.file);
  });
}

async function cmdRollback(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  await doRollback(interaction, manager, t, interaction.options.getInteger("count") ?? 1);
}

async function cmdRegenerate(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  await doRegenerate(interaction, manager, t);
}

async function cmdBackup(
  interaction: ChatInputCommandInteraction,
  manager: DSTManager,
  t: T,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    await interaction.deferReply();
    const label = interaction.options.getString("label") ?? undefined;
    const info = await manager.backup(label);
    await interaction.editReply(t("backup_created", info.file, formatSize(info.size)));
    return;
  }

  if (sub === "list") {
    const list = manager.listBackups();
    if (list.length === 0) {
      await interaction.reply(t("backup_list_empty"));
      return;
    }
    const body = list
      .slice(0, 20)
      .map(
        (b, i) =>
          `${i + 1}. \`${b.file}\` — ${formatSize(b.size)} — ${b.mtime.toLocaleString()}`,
      )
      .join("\n");
    await interaction.reply(`${t("backup_list_header", list.length)}\n${body}`);
    return;
  }

  // restore — ต้องหยุด server ก่อน + ยืนยัน
  const file = interaction.options.getString("file", true);
  if (manager.status().some((s) => s.running)) {
    await interaction.reply({
      content: t("restore_must_stop"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await confirmAndRun(
    interaction,
    t,
    t("restore_warning", file),
    async () => {
      await manager.restore(file);
      return t("restore_done", file);
    },
  );
}

async function cmdConfig(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
  manager: DSTManager,
  t: T,
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
    await interaction.editReply(t("config_set", result.key, shown));
    return;
  }

  // unreachable แต่กัน type
  await interaction.reply({
    content: t("unsupported_subcommand", sub),
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
  const t = makeT(config.language);
  const roleId = config.discord.adminRoleId;
  const ping = roleId ? `<@&${roleId}> ` : "";
  const text = e.restarting
    ? `${ping}${t("crash_restarting", e.shard, String(e.code ?? "?"))}`
    : `${ping}${t("crash_giveup", e.shard)}`;
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
