import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { BotApp } from "./app.js";
import { loadConfig, saveConfig } from "./config.js";
import { createWebServer } from "./web/server.js";

/**
 * entrypoint — เปิด web UI ตลอด, บอทเปิด/ปิดจากปุ่มใน web UI
 * config ทุกอย่างอยู่ใน config.json (กรอกผ่านหน้า setup)
 */
async function main(): Promise<void> {
  const config = loadConfig();

  // ensure web token (generate ครั้งแรกแล้ว persist ลง config.json)
  if (!config.web.token) {
    config.web.token = randomBytes(24).toString("hex");
    saveConfig(config);
  }

  const app = new BotApp(config);
  const web = createWebServer(app);
  web.start();
  openBrowser(`http://${config.web.host}:${config.web.port}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received — shutting down...`);
    web.stop();
    try {
      await app.stop();
    } catch (err) {
      console.error("Error during stop:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

/** เปิดเบราว์เซอร์ไปหน้า web UI (best-effort ตาม platform) */
function openBrowser(url: string): void {
  try {
    const cmd =
      process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
    const child = spawn(cmd, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // เปิดไม่ได้ก็ไม่เป็นไร — ผู้ใช้เปิด URL เองได้
  }
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
