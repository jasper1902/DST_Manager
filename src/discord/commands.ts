import {
  SlashCommandBuilder,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { whitelistedKeys } from "../dst/clusterConfig.js";
import { type Lang, makeT } from "../i18n.js";

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
export function buildCommands(lang: Lang): RESTPostAPIApplicationCommandsJSONBody[] {
  const t = makeT(lang);
  const configKeyChoices = whitelistedKeys().map((f) => ({
    name: f.key,
    value: f.key,
  }));

  const commands = [
    new SlashCommandBuilder()
      .setName("start")
      .setDescription(t("cmd_start")),

    new SlashCommandBuilder()
      .setName("stop")
      .setDescription(t("cmd_stop")),

    new SlashCommandBuilder()
      .setName("restart")
      .setDescription(t("cmd_restart")),

    new SlashCommandBuilder()
      .setName("status")
      .setDescription(t("cmd_status")),

    new SlashCommandBuilder()
      .setName("logs")
      .setDescription(t("cmd_logs"))
      .addStringOption((o) =>
        o
          .setName("shard")
          .setDescription(t("cmd_logs_shard"))
          .setRequired(false),
      )
      .addIntegerOption((o) =>
        o
          .setName("lines")
          .setDescription(t("cmd_logs_lines"))
          .setMinValue(1)
          .setMaxValue(50)
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("players")
      .setDescription(t("cmd_players")),

    new SlashCommandBuilder()
      .setName("mods")
      .setDescription(t("cmd_mods")),

    new SlashCommandBuilder()
      .setName("announce")
      .setDescription(t("cmd_announce"))
      .addStringOption((o) =>
        o
          .setName("message")
          .setDescription(t("cmd_announce_message"))
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("save")
      .setDescription(t("cmd_save")),

    new SlashCommandBuilder()
      .setName("rollback")
      .setDescription(t("cmd_rollback"))
      .addIntegerOption((o) =>
        o
          .setName("count")
          .setDescription(t("cmd_rollback_count"))
          .setMinValue(1)
          .setMaxValue(5)
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("regenerate")
      .setDescription(t("cmd_regenerate")),

    new SlashCommandBuilder()
      .setName("backup")
      .setDescription(t("cmd_backup"))
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription(t("cmd_backup_create"))
          .addStringOption((o) =>
            o
              .setName("label")
              .setDescription(t("cmd_backup_label"))
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription(t("cmd_backup_list")),
      )
      .addSubcommand((sub) =>
        sub
          .setName("restore")
          .setDescription(t("cmd_backup_restore"))
          .addStringOption((o) =>
            o
              .setName("file")
              .setDescription(t("cmd_backup_file"))
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),

    new SlashCommandBuilder()
      .setName("config")
      .setDescription(t("cmd_config"))
      .addSubcommand((sub) =>
        sub.setName("show").setDescription(t("cmd_config_show")),
      )
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription(t("cmd_config_set"))
          .addStringOption((o) => {
            o
              .setName("key")
              .setDescription(t("cmd_config_key"))
              .setRequired(true);
            for (const c of configKeyChoices) o.addChoices(c);
            return o;
          })
          .addStringOption((o) =>
            o
              .setName("value")
              .setDescription(t("cmd_config_value"))
              .setRequired(true),
          ),
      ),
  ];

  return commands.map((c) => c.toJSON());
}
