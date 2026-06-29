import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { BotApp } from "../app.js";
import { type AppConfig, missingRequired, saveConfig } from "../config.js";
import { setConfig, showConfig, whitelistedKeys } from "../dst/clusterConfig.js";
import { hasClusterToken, readClusterToken, writeClusterToken } from "../dst/clusterToken.js";
import { asLang, makeT } from "../i18n.js";

/**
 * Web server — entry point หลัก (รันตลอด) ครอบ BotApp
 *
 * - หน้า setup: กรอก/บันทึก config ทุกอย่าง (แทน .env)
 * - ปุ่ม run/stop bot
 * - เมื่อบอทรัน: ดูสถานะ, แก้ cluster.ini, สั่งงาน DST
 *
 * ปลอดภัย: bind localhost (default), ทุก /api/* ต้องมี token
 */

export interface WebServerHandle {
  start: () => void;
  stop: () => void;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, t: ReturnType<typeof makeT>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: Buffer) => {
      data += c.toString("utf8");
      if (data.length > 1_000_000) reject(new Error(t("err_body_too_large")));
    });
    req.on("end", () => {
      if (data.trim() === "") return resolve({});
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch {
        reject(new Error(t("err_bad_json")));
      }
    });
    req.on("error", reject);
  });
}

// ── setup serialization ────────────────────────────────────────────────

/** config สำหรับ setup form — ปิดบัง token (ส่ง flag has* แทน) */
function setupView(c: AppConfig): unknown {
  return {
    discord: {
      token: "",
      hasToken: c.discord.token !== "",
      clientId: c.discord.clientId,
      guildId: c.discord.guildId,
      adminRoleId: c.discord.adminRoleId ?? "",
      channelCategory: c.discord.channelCategory,
      logChannelName: c.discord.logChannelName,
      statusTextChannelName: c.discord.statusTextChannelName,
      controlChannelName: c.discord.controlChannelName,
      actionLogChannelName: c.discord.actionLogChannelName,
    },
    dst: {
      cluster: c.dst.cluster,
      shards: (c.dst.shards ?? []).join(","),
    },
    status: c.status,
    backup: c.backup,
    web: { host: c.web.host, port: c.web.port, token: "", hasToken: c.web.token !== "" },
    autoRestart: c.autoRestart,
    dailyRestartTime: c.dailyRestartTime ?? "",
    logBufferSize: c.logBufferSize,
    language: c.language,
  };
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function n(v: unknown, fallback: number): number {
  const x = typeof v === "number" ? v : Number.parseInt(s(v), 10);
  return Number.isFinite(x) ? x : fallback;
}
function b(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  const t = s(v).toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return fallback;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** สร้าง config ใหม่จาก current + ค่าที่กรอกมา (token ว่าง = คงของเดิม) */
function applySetup(cur: AppConfig, body: Record<string, unknown>): AppConfig {
  const d = obj(body.discord);
  const dst = obj(body.dst);
  const st = obj(body.status);
  const bk = obj(body.backup);
  const w = obj(body.web);
  const shardsCsv = s(dst.shards);
  const shards = shardsCsv ? shardsCsv.split(",").map((x) => x.trim()).filter(Boolean) : undefined;

  return {
    discord: {
      token: s(d.token) || cur.discord.token,
      clientId: s(d.clientId),
      guildId: s(d.guildId),
      adminRoleId: s(d.adminRoleId) || undefined,
      channelCategory: s(d.channelCategory) || cur.discord.channelCategory,
      logChannelName: s(d.logChannelName) || cur.discord.logChannelName,
      statusTextChannelName: s(d.statusTextChannelName) || cur.discord.statusTextChannelName,
      controlChannelName: s(d.controlChannelName) || cur.discord.controlChannelName,
      actionLogChannelName: s(d.actionLogChannelName) || cur.discord.actionLogChannelName,
    },
    dst: {
      // installDir/persistentRoot/confDir derive อัตโนมัติใน loadConfig — คงค่าปัจจุบันไว้เฉยๆ
      installDir: cur.dst.installDir,
      persistentRoot: cur.dst.persistentRoot,
      confDir: cur.dst.confDir,
      cluster: s(dst.cluster),
      shards: shards && shards.length > 0 ? shards : undefined,
    },
    status: {
      messageIntervalSec: n(st.messageIntervalSec, cur.status.messageIntervalSec),
      nameIntervalSec: Math.max(300, n(st.nameIntervalSec, cur.status.nameIntervalSec)),
      showPassword: b(st.showPassword, cur.status.showPassword),
    },
    backup: {
      dir: s(bk.dir) || cur.backup.dir,
      keep: Math.max(1, n(bk.keep, cur.backup.keep)),
    },
    web: {
      host: s(w.host) || cur.web.host,
      port: n(w.port, cur.web.port),
      token: s(w.token) || cur.web.token,
    },
    logBufferSize: n(body.logBufferSize, cur.logBufferSize),
    autoRestart: b(body.autoRestart, cur.autoRestart),
    dailyRestartTime: s(body.dailyRestartTime) || undefined,
    language: body.language === undefined ? cur.language : asLang(body.language),
  };
}

// ── api ──────────────────────────────────────────────────────────────

async function clusterConfigView(c: AppConfig): Promise<unknown> {
  const values = await showConfig(c.dst);
  return whitelistedKeys().map((f) => {
    const cur = values.find((v) => v.key === f.key);
    const sensitive = f.key === "cluster_password";
    return {
      key: f.key,
      type: f.type,
      values: f.values ?? null,
      description: f.description,
      sensitive,
      value: sensitive ? "" : (cur?.value ?? "(unset)"),
    };
  });
}

async function handleApi(app: BotApp, req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const config = app.config;
  const t = makeT(config.language);

  // เปลี่ยนภาษา (จาก selector บน web UI) — persist ลง config.json ทันที, ได้ทั้งตอน bot รัน/หยุด
  if (req.method === "POST" && path === "/api/lang") {
    const body = await readBody(req, t);
    const language = asLang(body.language);
    saveConfig({ ...config, language });
    app.setConfig({ ...config, language });
    return json(res, 200, { ok: true, language });
  }

  if (req.method === "GET" && path === "/api/bot/state") {
    return json(res, 200, { state: app.state, missing: missingRequired(config), error: app.error });
  }
  if (req.method === "POST" && path === "/api/bot/start") {
    await app.start();
    return json(res, 200, { ok: true, state: app.state });
  }
  if (req.method === "POST" && path === "/api/bot/stop") {
    await app.stop();
    return json(res, 200, { ok: true, state: app.state });
  }
  if (req.method === "POST" && path === "/api/bot/restart") {
    await app.restart();
    return json(res, 200, { ok: true, state: app.state });
  }

  // ── ติดตั้ง/อัปเดต DST server ผ่าน SteamCMD ──
  if (req.method === "GET" && path === "/api/server/status") {
    return json(res, 200, app.installStatus());
  }
  if (req.method === "POST" && path === "/api/server/install") {
    app.installServer(); // เริ่ม background — poll /api/server/status ดู progress
    return json(res, 200, { ok: true });
  }

  // ── cluster_token.txt (จำเป็นต่อการ start server) ──
  if (req.method === "GET" && path === "/api/token") {
    return json(res, 200, {
      hasToken: hasClusterToken(config.dst),
      token: readClusterToken(config.dst) ?? "",
      cluster: config.dst.cluster,
    });
  }
  if (req.method === "POST" && path === "/api/token") {
    if (config.dst.cluster === "") return json(res, 400, { error: t("err_set_cluster_first") });
    const body = await readBody(req, t);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token === "") return json(res, 400, { error: t("err_token_empty") });
    writeClusterToken(config.dst, token);
    return json(res, 200, { ok: true, hasToken: true, note: t("token_saved") });
  }

  if (req.method === "GET" && path === "/api/setup") {
    return json(res, 200, setupView(config));
  }
  if (req.method === "POST" && path === "/api/setup") {
    const next = applySetup(config, await readBody(req, t));
    saveConfig(next);
    app.setConfig(next);
    return json(res, 200, {
      ok: true,
      missing: missingRequired(next),
      note: app.state === "running" ? t("setup_saved_restart") : t("setup_saved"),
    });
  }

  // ── ต่อไปนี้ต้องมี cluster config / bot ทำงาน ──
  if (req.method === "GET" && path === "/api/config") {
    return json(res, 200, {
      cluster: await clusterConfigView(config),
      app: { shards: app.manager?.activeShards() ?? config.dst.shards ?? ["(auto)"], persistentRoot: config.dst.persistentRoot, cluster: config.dst.cluster },
    });
  }
  if (req.method === "POST" && path === "/api/config") {
    const body = await readBody(req, t);
    if (typeof body.key !== "string" || typeof body.value !== "string") {
      return json(res, 400, { error: t("err_key_value_string") });
    }
    const r = await setConfig(config.dst, body.key, body.value);
    const sensitive = r.key === "cluster_password";
    return json(res, 200, { ok: true, key: r.key, value: sensitive ? "•••" : r.value, note: t("effect_on_restart") });
  }

  const manager = app.manager;
  if (req.method === "GET" && path === "/api/status") {
    if (!manager) return json(res, 200, { running: false, shards: [], anyRunning: false, players: [], world: null });
    const shards = manager.status();
    const anyRunning = shards.some((x) => x.running);
    const [players, world] = await Promise.all([
      anyRunning ? manager.listPlayers() : Promise.resolve([]),
      anyRunning ? manager.getWorldInfo() : Promise.resolve(null),
    ]);
    return json(res, 200, { running: true, shards, anyRunning, players, world });
  }
  if (req.method === "GET" && path === "/api/mods") {
    if (!manager) return json(res, 200, { available: false, mods: [] });
    const mods = await manager.getMods();
    if (mods === null) return json(res, 200, { available: false, mods: [] });
    return json(res, 200, { available: true, mods });
  }
  if (req.method === "POST" && path === "/api/control") {
    if (!manager) return json(res, 409, { error: t("bot_not_running") });
    const body = await readBody(req, t);
    const action = String(body.action);
    switch (action) {
      case "start":
        await manager.start();
        return json(res, 200, { ok: true, message: t("ctrl_start") });
      case "stop":
        await manager.stop();
        return json(res, 200, { ok: true, message: t("ctrl_stop") });
      case "restart":
        await manager.restart();
        return json(res, 200, { ok: true, message: t("ctrl_restart") });
      case "save": {
        const c = manager.save();
        return json(res, 200, { ok: c > 0, message: c ? t("ctrl_save", c) : t("ctrl_no_shard") });
      }
      case "backup": {
        const info = await manager.backup();
        return json(res, 200, { ok: true, message: t("ctrl_backup", info.file) });
      }
      default:
        return json(res, 400, { error: t("unsupported_action", action) });
    }
  }

  json(res, 404, { error: "not found" });
}

export function createWebServer(app: BotApp): WebServerHandle {
  const server: Server = createServer((req, res) => void route(app, req, res));

  return {
    start(): void {
      const { host, port } = app.config.web;
      server.on("error", (err) => console.error("[web] server error:", err));
      server.listen(port, host, () => {
        console.log(`\n========================================`);
        console.log(`  Web UI:  http://${host}:${port}`);
        console.log(`  Token:   ${app.config.web.token}`);
        console.log(`========================================\n`);
      });
    },
    stop(): void {
      server.close();
    },
  };
}

async function route(app: BotApp, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const path = (req.url ?? "/").split("?")[0] ?? "/";

    if (req.method === "GET" && path === "/") {
      const { PAGE } = await import("./page.js");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }

    if (path.startsWith("/api/")) {
      if (req.headers["x-dst-token"] !== app.config.web.token) {
        return json(res, 401, { error: "unauthorized" });
      }
      return await handleApi(app, req, res, path);
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
}
