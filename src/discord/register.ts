import { REST, Routes } from "discord.js";
import { type AppConfig, loadConfig } from "../config.js";
import { buildCommands } from "./commands.js";

/**
 * register slash command เข้า guild (register แบบ guild → เห็นผลทันที)
 * เรียกได้ทั้งจาก bot ตอน start (อัตโนมัติทุกครั้ง) และจากสคริปต์ `bun run register`
 */
export async function registerCommands(config: AppConfig): Promise<void> {
  const commands = buildCommands();
  const rest = new REST({ version: "10" }).setToken(config.discord.token);
  await rest.put(
    Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
    { body: commands },
  );
  console.log(`✓ Registered ${commands.length} slash commands (guild ${config.discord.guildId})`);
}

// รันตรง ๆ (`bun run register`) เท่านั้นถึงจะ execute; ถูก import เฉย ๆ จะไม่ทำงาน
if (import.meta.main) {
  registerCommands(loadConfig()).catch((err: unknown) => {
    console.error("Failed to register commands:", err);
    process.exit(1);
  });
}
