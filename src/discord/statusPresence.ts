import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type GuildTextBasedChannel,
  type VoiceChannel,
} from "discord.js";
import type { AppConfig } from "../config.js";
import { showConfig } from "../dst/clusterConfig.js";
import type { DSTManager, ShardStatus } from "../dst/manager.js";
import type { ModEntry } from "../dst/mods.js";

/** marker ซ่อนใน footer ไว้ค้น message เดิมตอน bot รีสตาร์ท (กันส่งซ้ำ) */
const MARKER = "DST-MANAGER-STATUS";

const COLOR_ONLINE = 0x57f287;
const COLOR_OFFLINE = 0xed4245;
const COLOR_PARTIAL = 0xfee75c;
const COLOR_MODS = 0x5865f2;

/** ลิมิต Discord: 10 embeds/ข้อความ, รวมทุก embed ≤ 6000 ตัว, description ≤ 4096 */
const MAX_EMBEDS = 10;
/** ความยาว description ต่อ embed ม็อด (เผื่อ margin จาก 4096) */
const MOD_EMBED_CHARS = 3900;
/** งบรวมสำหรับ embed ม็อดทั้งหมด (เผื่อ status embed ใน 6000) */
const MODS_TOTAL_BUDGET = 4800;

const STATE_ICON: Record<string, string> = {
  running: "🟢",
  starting: "🟡",
  stopping: "🟠",
  stopped: "🔴",
};

interface ClusterInfo {
  name: string;
  password: string;
  maxPlayers: string;
  gameMode: string;
  pvp: string;
  intention: string;
}

interface StatusSnapshot {
  shards: ShardStatus[];
  anyRunning: boolean;
  allRunning: boolean;
  players: string[];
  cluster: ClusterInfo | null;
  /** จำนวนวันในเกม (best-effort); null = query ไม่ได้/ไม่ได้รัน */
  day: number | null;
  /** ฤดูในเกม เช่น autumn/winter (best-effort); null = query ไม่ได้ */
  season: string | null;
  /** ม็อดที่เปิดใช้ (จาก modoverrides.lua); null = ไม่ได้ลงม็อด */
  mods: ModEntry[] | null;
}

/** map ฤดู DST → ข้อความไทย + emoji */
const SEASON_TH: Record<string, string> = {
  autumn: "🍂 ใบไม้ร่วง",
  winter: "❄️ ฤดูหนาว",
  spring: "🌷 ใบไม้ผลิ",
  summer: "☀️ ฤดูร้อน",
};

function seasonText(season: string | null): string {
  if (!season) return "—";
  return SEASON_TH[season.toLowerCase()] ?? season;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** แปลง DiscordAPIError เป็นข้อความสั้น ๆ ที่บอกวิธีแก้ แทนการ dump stack ยาว */
function describeDiscordError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === 50013 || code === 50001) {
      return (
        `bot ขาดสิทธิ์ในห้องนี้ (code ${String(code)}) — เปิดสิทธิ์ View Channel, ` +
        `Send Messages, Embed Links, Manage Channels ให้ role ของ bot`
      );
    }
    if (code === 30013 || code === 429) {
      return `ติด rate limit การเปลี่ยนชื่อห้อง (code ${String(code)}) — Discord จำกัด 2 ครั้ง/10 นาที`;
    }
    return `Discord error code ${String(code)}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * อัปเดตสถานะ server ลง Discord (แยกสองห้อง):
 *  - voice channel: "ชื่อห้อง" = สถานะ + จำนวนผู้เล่น (ทุก nameIntervalSec;
 *    Discord limit เปลี่ยนชื่อห้อง 2/10นาที)
 *  - text channel: embed ข้อมูลครบ (ทุก messageIntervalSec) โดยแก้ message เดิม
 *
 * transport detail ทั้งหมดอยู่ที่นี่ — DSTManager ไม่รับรู้
 */
export class ServerStatusPresence {
  private readonly client: Client;
  private readonly manager: DSTManager;
  private readonly config: AppConfig;
  private readonly voiceChannelId: string;
  private readonly textChannelId: string;

  private messageId: string | null = null;
  private lastVoiceName = "";
  private startedAt: number | null = null;
  private timers: NodeJS.Timeout[] = [];
  // กัน log ซ้ำทุกรอบ: จำ error ล่าสุดของแต่ละงาน เคลียร์เมื่อสำเร็จ
  private lastVoiceError = "";
  private lastMsgError = "";

  /** log error เฉพาะเมื่อต่างจากครั้งก่อน (กัน spam ทุก interval) */
  private logOnce(slot: "voice" | "msg", prefix: string, err: unknown): void {
    const desc = describeDiscordError(err);
    if (slot === "voice") {
      if (desc === this.lastVoiceError) return;
      this.lastVoiceError = desc;
    } else {
      if (desc === this.lastMsgError) return;
      this.lastMsgError = desc;
    }
    console.error(`${prefix} ${desc}`);
  }

  constructor(
    client: Client,
    manager: DSTManager,
    config: AppConfig,
    voiceChannelId: string,
    textChannelId: string,
  ) {
    this.client = client;
    this.manager = manager;
    this.config = config;
    this.voiceChannelId = voiceChannelId;
    this.textChannelId = textChannelId;
  }

  start(): void {
    const msgMs = this.config.status.messageIntervalSec * 1000;
    const nameMs = this.config.status.nameIntervalSec * 1000;

    // ยิงรอบแรกทันทีหลัง bot ready
    void this.updateMessage();
    void this.updateVoiceName();

    const t1 = setInterval(() => void this.updateMessage(), msgMs);
    const t2 = setInterval(() => void this.updateVoiceName(), nameMs);
    t1.unref();
    t2.unref();
    this.timers.push(t1, t2);
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  // ── data ────────────────────────────────────────────────────────────

  private async snapshot(): Promise<StatusSnapshot> {
    const shards = this.manager.status();
    const anyRunning = shards.some((s) => s.running);
    const allRunning = shards.every((s) => s.running);

    // track uptime แบบ best-effort (เริ่มนับเมื่อเห็นว่ารันครั้งแรก)
    if (anyRunning && this.startedAt === null) this.startedAt = Date.now();
    if (!anyRunning) this.startedAt = null;

    const players = anyRunning ? await this.manager.listPlayers() : [];
    const world = anyRunning ? await this.manager.getWorldInfo() : null;
    const cluster = await this.readClusterInfo();
    // ชื่อม็อดถูก cache 7 วันใน mods.ts → ดึงทุกรอบแทบไม่มี network; พังก็คืน null
    const mods = await this.manager.getMods().catch(() => null);
    return {
      shards,
      anyRunning,
      allRunning,
      players,
      cluster,
      day: world?.day ?? null,
      season: world?.season ?? null,
      mods,
    };
  }

  private async readClusterInfo(): Promise<ClusterInfo | null> {
    try {
      const values = await showConfig(this.config.dst);
      const get = (k: string): string =>
        values.find((v) => v.key === k)?.value ?? "(unset)";
      return {
        name: get("cluster_name"),
        password: get("cluster_password"),
        maxPlayers: get("max_players"),
        gameMode: get("game_mode"),
        pvp: get("pvp"),
        intention: get("cluster_intention"),
      };
    } catch {
      return null; // อ่าน cluster.ini ไม่ได้ (เช่นยังไม่ได้สร้าง) → embed ยังโชว์สถานะได้
    }
  }

  private uptimeText(): string {
    if (this.startedAt === null) return "—";
    const sec = Math.floor((Date.now() - this.startedAt) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} ชม. ${m} นาที`;
    return `${m} นาที`;
  }

  // ── render ──────────────────────────────────────────────────────────

  private serverName(c: ClusterInfo | null): string {
    const n = c?.name;
    return n && n !== "(unset)" ? n : "DST Server";
  }

  /** ชื่อ voice channel: โชว์แค่สถานะ server + จำนวนผู้เล่น (limit 100 ตัว) */
  private buildVoiceName(s: StatusSnapshot): string {
    if (!s.anyRunning) return "🔴 ออฟไลน์";
    const max = s.cluster && s.cluster.maxPlayers !== "(unset)" ? `/${s.cluster.maxPlayers}` : "";
    return truncate(`🟢 ออนไลน์ • ${s.players.length}${max} คน`, 100);
  }

  private buildEmbed(s: StatusSnapshot): EmbedBuilder {
    const c = s.cluster;
    const color = !s.anyRunning ? COLOR_OFFLINE : s.allRunning ? COLOR_ONLINE : COLOR_PARTIAL;

    const shardText = s.shards
      .map((sh) => `${STATE_ICON[sh.state] ?? "⚪"} ${sh.shard}: ${sh.state}`)
      .join("\n");

    const maxText = c && c.maxPlayers !== "(unset)" ? `/${c.maxPlayers}` : "";
    const playerList = s.players.length
      ? truncate(s.players.map((p, i) => `${i + 1}. ${p}`).join("\n"), 1000)
      : "—";

    const dayText = s.anyRunning && s.day !== null ? `วันที่ ${s.day}` : "—";

    const embed = new EmbedBuilder()
      .setTitle(`Server name: ${this.serverName(c)}`)
      .setColor(color)
      .addFields(
        { name: "สถานะ", value: shardText || "—", inline: true },
        {
          name: "ผู้เล่น",
          value: s.anyRunning ? `${s.players.length}${maxText}` : "—",
          inline: true,
        },
        { name: "วัน", value: dayText, inline: true },
        { name: "ฤดู", value: s.anyRunning ? seasonText(s.season) : "—", inline: true },
        { name: "Uptime", value: this.uptimeText(), inline: true },
      );

    if (c) {
      if (this.config.status.showPassword) {
        const pw = c.password && c.password !== "(unset)" ? `\`${c.password}\`` : "🔓 ไม่มี";
        embed.addFields({ name: "รหัสผ่าน", value: pw, inline: true });
      }
      if (c.gameMode !== "(unset)") {
        embed.addFields({ name: "โหมด", value: c.gameMode, inline: true });
      }
      if (c.pvp !== "(unset)") {
        embed.addFields({ name: "PvP", value: c.pvp === "true" ? "เปิด" : "ปิด", inline: true });
      }
      if (c.intention !== "(unset)") {
        embed.addFields({ name: "ประเภท", value: c.intention, inline: true });
      }
    }

    embed.addFields({ name: "รายชื่อผู้เล่น", value: playerList, inline: false });
    embed.setFooter({ text: `${MARKER} • อัปเดตล่าสุด` }).setTimestamp(new Date());
    return embed;
  }

  /**
   * embeds รายชื่อม็อด (ชื่อเป็นลิงก์ markdown → คลิกไปหน้า workshop)
   * แบ่งหลาย embed: แต่ละตัว description ≤ MOD_EMBED_CHARS, เพิ่ม embed ไปจน
   * ครบทุกม็อด — แต่ไม่เกินลิมิต Discord (จำนวน embed + งบรวม 6000 ตัว)
   * เกินงบ → ต่อท้าย "… +N ม็อด" ที่ embed สุดท้าย (best-effort)
   *
   * maxEmbeds = จำนวน embed ม็อดที่เหลือใช้ได้ (หัก status embed ออกแล้ว)
   */
  private buildModEmbeds(mods: ModEntry[] | null, maxEmbeds: number): EmbedBuilder[] {
    if (mods === null) return [];
    const enabled = mods.filter((m) => m.enabled);
    if (enabled.length === 0) return [];

    const chunks: string[] = [];
    let cur = "";
    let total = 0;
    let shown = 0;
    for (const m of enabled) {
      const line = `• [${m.name}](${m.url})`;
      // หยุดถ้าจะเกินจำนวน embed ที่เหลือ หรือเกินงบรวม
      const wouldNewChunk = cur !== "" && cur.length + 1 + line.length > MOD_EMBED_CHARS;
      const chunksSoFar = chunks.length + (cur ? 1 : 0);
      if (wouldNewChunk && chunksSoFar >= maxEmbeds) break;
      if (total + line.length + 1 > MODS_TOTAL_BUDGET) break;

      if (wouldNewChunk) {
        chunks.push(cur);
        cur = line;
      } else {
        cur = cur ? `${cur}\n${line}` : line;
      }
      total += line.length + 1;
      shown++;
    }
    if (cur) chunks.push(cur);

    const rest = enabled.length - shown;
    if (rest > 0 && chunks.length > 0) {
      chunks[chunks.length - 1] += `\n… +${rest} ม็อด`;
    }

    return chunks.map((desc, i) =>
      new EmbedBuilder()
        .setColor(COLOR_MODS)
        .setTitle(i === 0 ? `🧩 ม็อดที่ใช้ (${enabled.length})` : "🧩 ม็อด (ต่อ)")
        .setDescription(desc),
    );
  }

  // ── discord IO ──────────────────────────────────────────────────────

  /** fetch ห้อง text สำหรับ embed (มี messages/send) */
  private async getTextChannel(): Promise<GuildTextBasedChannel | null> {
    try {
      const ch = await this.client.channels.fetch(this.textChannelId);
      if (!ch || ch.isDMBased() || !ch.isTextBased()) return null;
      return ch;
    } catch {
      return null;
    }
  }

  /** fetch ห้อง voice สำหรับเปลี่ยนชื่อห้อง (มี setName) */
  private async getVoiceChannel(): Promise<VoiceChannel | null> {
    try {
      const ch = await this.client.channels.fetch(this.voiceChannelId);
      if (ch && ch.type === ChannelType.GuildVoice) return ch;
      return null;
    } catch {
      return null;
    }
  }

  private async updateMessage(): Promise<void> {
    const channel = await this.getTextChannel();
    if (!channel || !channel.isSendable()) return;
    const snap = await this.snapshot();
    const statusEmbed = this.buildEmbed(snap);
    // status embed 1 ตัว + ม็อดได้อีกไม่เกิน MAX_EMBEDS-1
    const modEmbeds = this.buildModEmbeds(snap.mods, MAX_EMBEDS - 1);
    const embeds = [statusEmbed, ...modEmbeds];

    // edit message เดิมถ้ามี
    if (this.messageId) {
      try {
        const msg = await channel.messages.fetch(this.messageId);
        await msg.edit({ embeds });
        this.lastMsgError = "";
        return;
      } catch {
        this.messageId = null; // หาไม่เจอ (ถูกลบ) → ส่งใหม่
      }
    }

    // หา message เดิมของ bot จาก marker (กันส่งซ้ำหลังรีสตาร์ท)
    try {
      const recent = await channel.messages.fetch({ limit: 25 });
      const mine = recent.find(
        (m) =>
          m.author.id === this.client.user?.id &&
          (m.embeds[0]?.footer?.text?.includes(MARKER) ?? false),
      );
      if (mine) {
        this.messageId = mine.id;
        await mine.edit({ embeds });
        this.lastMsgError = "";
        return;
      }
    } catch {
      // ค้นไม่ได้ → ส่งใหม่ด้านล่าง
    }

    try {
      const sent = await channel.send({ embeds });
      this.messageId = sent.id;
      this.lastMsgError = "";
    } catch (err) {
      this.logOnce("msg", "[status] ส่ง embed ไม่ได้:", err);
    }
  }

  private async updateVoiceName(): Promise<void> {
    const channel = await this.getVoiceChannel();
    if (!channel) return;
    const name = this.buildVoiceName(await this.snapshot());
    if (name === this.lastVoiceName) return; // ไม่เปลี่ยน → ประหยัด quota
    try {
      await channel.setName(name);
      this.lastVoiceName = name;
      this.lastVoiceError = "";
    } catch (err) {
      this.logOnce("voice", "[status] เปลี่ยนชื่อห้องไม่ได้:", err);
    }
  }
}
