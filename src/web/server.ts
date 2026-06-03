import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { BotApp } from "../app.js";
import { type AppConfig, missingRequired, saveConfig } from "../config.js";
import { setConfig, showConfig, whitelistedKeys } from "../dst/clusterConfig.js";

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

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: Buffer) => {
      data += c.toString("utf8");
      if (data.length > 1_000_000) reject(new Error("body ใหญ่เกินไป"));
    });
    req.on("end", () => {
      if (data.trim() === "") return resolve({});
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch {
        reject(new Error("JSON ไม่ถูกต้อง"));
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
      installDir: c.dst.installDir,
      persistentRoot: c.dst.persistentRoot,
      confDir: c.dst.confDir,
      cluster: c.dst.cluster,
      shards: (c.dst.shards ?? []).join(","),
    },
    status: c.status,
    backup: c.backup,
    web: { host: c.web.host, port: c.web.port, token: "", hasToken: c.web.token !== "" },
    autoRestart: c.autoRestart,
    dailyRestartTime: c.dailyRestartTime ?? "",
    logBufferSize: c.logBufferSize,
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
      installDir: s(dst.installDir),
      persistentRoot: s(dst.persistentRoot) || cur.dst.persistentRoot,
      confDir: s(dst.confDir) || cur.dst.confDir,
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

  if (req.method === "GET" && path === "/api/setup") {
    return json(res, 200, setupView(config));
  }
  if (req.method === "POST" && path === "/api/setup") {
    const next = applySetup(config, await readBody(req));
    saveConfig(next);
    app.setConfig(next);
    return json(res, 200, {
      ok: true,
      missing: missingRequired(next),
      note: app.state === "running" ? "บันทึกแล้ว — กด restart bot เพื่อใช้ค่าใหม่" : "บันทึกแล้ว",
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
    const body = await readBody(req);
    if (typeof body.key !== "string" || typeof body.value !== "string") {
      return json(res, 400, { error: "ต้องมี key และ value เป็น string" });
    }
    const r = await setConfig(config.dst, body.key, body.value);
    const sensitive = r.key === "cluster_password";
    return json(res, 200, { ok: true, key: r.key, value: sensitive ? "•••" : r.value, note: "มีผลตอน restart server" });
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
  if (req.method === "POST" && path === "/api/control") {
    if (!manager) return json(res, 409, { error: "บอทยังไม่ได้รัน" });
    const body = await readBody(req);
    const action = String(body.action);
    switch (action) {
      case "start":
        await manager.start();
        return json(res, 200, { ok: true, message: "สั่ง start แล้ว" });
      case "stop":
        await manager.stop();
        return json(res, 200, { ok: true, message: "ปิด DST server แล้ว" });
      case "restart":
        await manager.restart();
        return json(res, 200, { ok: true, message: "รีสตาร์ท DST แล้ว" });
      case "save": {
        const c = manager.save();
        return json(res, 200, { ok: c > 0, message: c ? `save แล้ว (${c} shard)` : "ไม่มี shard รัน" });
      }
      case "backup": {
        const info = await manager.backup();
        return json(res, 200, { ok: true, message: `backup: ${info.file}` });
      }
      default:
        return json(res, 400, { error: `action ไม่รองรับ: ${action}` });
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
