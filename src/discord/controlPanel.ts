import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
} from "discord.js";
import { type Lang, makeT } from "../i18n.js";

/**
 * Control panel: ข้อความถาวรในห้อง control ที่มีปุ่มสั่งงาน
 * customId ใช้ prefix "ctrl:" เพื่อให้ bot.ts แยกออกจากปุ่ม confirm/cancel
 *
 * ปุ่มเป็น static customId → กดได้แม้ bot รีสตาร์ท (global handler รับเอง)
 * ไม่ต้อง repost ทุก boot แค่ find-or-create ให้มีอันเดียว
 */

const MARKER = "DST-CONTROL-PANEL";

/** action ที่ผูกกับปุ่ม (ตรงกับ customId หลัง "ctrl:") */
export const CONTROL_ACTIONS = [
  "start",
  "stop",
  "restart",
  "save",
  "backup",
  "status",
  "players",
  "mods",
  "logs",
  "config",
  "announce",
  "configset",
  "rollback",
  "regenerate",
] as const;

function buildRows(): ActionRowBuilder<ButtonBuilder>[] {
  // แถว 1: lifecycle · แถว 2: ดูข้อมูล · แถว 3: กรอกค่า (modal) + คำสั่งอันตราย (มียืนยัน)
  const lifecycle = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ctrl:start").setLabel("Start").setEmoji("▶️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ctrl:stop").setLabel("Stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ctrl:restart").setLabel("Restart").setEmoji("🔄").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ctrl:save").setLabel("Save").setEmoji("💾").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ctrl:backup").setLabel("Backup").setEmoji("🗄️").setStyle(ButtonStyle.Secondary),
  );
  const info = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ctrl:status").setLabel("Status").setEmoji("📊").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ctrl:players").setLabel("Players").setEmoji("👥").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ctrl:mods").setLabel("Mods").setEmoji("🧩").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ctrl:logs").setLabel("Logs").setEmoji("📜").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ctrl:config").setLabel("Config").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
  );
  const more = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ctrl:announce").setLabel("Announce").setEmoji("📢").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ctrl:configset").setLabel("Set config").setEmoji("📝").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ctrl:rollback").setLabel("Rollback").setEmoji("↩️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ctrl:regenerate").setLabel("Regenerate").setEmoji("🔥").setStyle(ButtonStyle.Danger),
  );
  return [lifecycle, info, more];
}

function buildEmbed(lang: Lang): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎮 DST Control Panel")
    .setDescription(makeT(lang)("control_panel_desc"))
    .setColor(0x5865f2)
    .setFooter({ text: MARKER });
}

/** ทำให้มี control panel message อันเดียวในห้อง (find-or-create) */
export async function ensureControlPanel(client: Client, channelId: string, lang: Lang): Promise<void> {
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    const embed = buildEmbed(lang);
    const components = buildRows();

    const recent = await ch.messages.fetch({ limit: 25 });
    const mine = recent.find(
      (m) => m.author.id === client.user?.id && m.embeds[0]?.footer?.text === MARKER,
    );
    if (mine) {
      await mine.edit({ embeds: [embed], components });
      return;
    }
    await ch.send({ embeds: [embed], components });
  } catch (err) {
    console.error("[control] โพสต์ control panel ไม่ได้:", err);
  }
}
