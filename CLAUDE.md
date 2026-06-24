# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A manager for a **Don't Starve Together (DST) dedicated server**, controlled via a **Discord bot** and a **local web UI**. Runs on **bun** (TypeScript executed directly, no Node/transpile step) as a single process. Most comments and user-facing strings are in Thai; match that when editing existing files.

Core idea: there is **no RCON**. The manager supervises the DST server binary as a child process, sends Lua console commands via **stdin** (`-console` flag), reads `stdout`/`stderr` line-by-line, and edits `cluster.ini` directly. Because it spawns the real binary, **the bot must run on the same machine/user as the DST install**.

The server binary is **not** installed manually — the manager **auto-downloads it via SteamCMD** (app id `343050`, `login anonymous`) from a button in the web UI. Everything lives next to the executable in a fixed layout (`appBaseDir()` in `dst/paths.ts` = the exe's folder when compiled, else cwd):

```
dst-manager.exe / config.json / channels.json
steamcmd/                              # SteamCMD bootstrapper (auto-downloaded + extracted)
games/DoNotStarveTogether/
  server/                              # the dedicated server  → DSTConfig.installDir
    bin64/dontstarve_dedicated_server_nullrenderer_x64.exe
  clusters/<cluster>/                  # cluster data (Master/Caves/cluster.ini)
backups/
```

## Commands

```powershell
bun install
bun start          # entry point: starts web UI + opens browser. Bot does NOT auto-start.
bun run dev        # same as start but --watch (restart on file change)
bun run typecheck  # tsc --noEmit (strict) — the only check; run before considering work done
bun run register   # manually re-register Discord slash commands
bun run build      # compile a standalone dst-manager.exe (bun --compile, windows-x64)
```

There is **no test suite** and no linter beyond `tsc`. `bun run typecheck` is the gate.

## Architecture

The system is built around a **transport-agnostic core** (`DSTManager`) with two thin adapters (Discord, web) layered on top. Adapters contain no business logic — they map input → manager method → format output.

```
index.ts ─ boots web server (always on) + opens browser
   │
   └─ BotApp (app.ts) ─ start/stop lifecycle of the bot half
        ├─ DSTManager (dst/manager.ts)  ◄── THE CORE. No knowledge of Discord/web.
        │     ├─ ShardProcess[] (dst/process.ts)  one supervised child proc per shard
        │     ├─ scheduler.ts  optional daily auto-restart
        │     └─ helpers: backup, mods, clusterConfig, console, logParser, paths, shards
        ├─ Discord client (discord/bot.ts)  ── adapter: interaction → manager
        └─ web server (web/server.ts)        ── adapter: HTTP /api/* → manager
```

Key boundaries to preserve:

- **`DSTManager` must stay transport-agnostic.** It extends `EventEmitter` and emits `line` / `state` / `exit` / `crash`. Adapters subscribe; the manager never imports Discord or HTTP. New features belong here as methods + events, with adapters wiring them up.
- **`ShardProcess` knows nothing about Lua or DST semantics** — it only spawns a binary, writes raw strings to stdin, and emits stdout lines as a ring buffer. Lua command strings are built in `dst/console.ts`.
- **Web server runs continuously; the bot starts/stops on demand** (button in web UI). `BotApp` owns the live config — config changes are only allowed while the bot is **stopped**, then take effect on next `start()`.

## DST-specific mechanics (non-obvious)

- **Shards**: a cluster has a `Master` (always started first, with an 8s delay before dependents) plus optional shards like `Caves`. Shard list resolution order: explicit `dst.shards` config → auto-discover folders containing `server.ini` (`dst/shards.ts`) → fall back to `["Master"]`. Stop happens in reverse order (dependents before Master).
- **Stop is graceful-then-forced**: send `c_shutdown(true)` via stdin → wait up to 30s → `taskkill /T /F` on Windows (kills the whole process tree; `proc.kill()` only kills the parent and Windows has no real SIGKILL). Before any intentional stop the code calls `shard.requestStop()` so the resulting `exit` is **not** treated as a crash.
- **Auto-restart / crash loop guard**: an unintentional `exit` triggers auto-restart after 5s, but >3 crashes in 120s makes the manager give up and emit `crash` with `restarting: false` (surfaced to admins). User-initiated stops never count as crashes.
- **Querying live data is best-effort via stdout scraping**: `listPlayers()` and `getWorldInfo()` fire a Lua command (`c_listallplayers`, world info) then collect matching stdout lines within a short window (1–1.5s) parsed by regex in `dst/logParser.ts`. These regexes are fragile and version-dependent — **`/status` (process up/down) is always reliable; `/players` and day/season are not.**
- **Mods** (`dst/mods.ts`): read from `modoverrides.lua` (per-shard, tries Master first), resolve workshop IDs → names via the public Steam Web API, cached 7 days in `mods-cache.json`. Offline/unresolvable → falls back to ID + workshop link.
- **Editable cluster config is whitelisted** in `dst/clusterConfig.ts` (`WHITELIST`): only those `cluster.ini` keys can be read/written via `/config` or the web UI. Changes take effect on restart. `cluster_password` is treated as sensitive and masked.
- **Backups** use the system `tar` (bundled on Win10+/Linux/macOS, no dependency); `.tar.gz` of the whole cluster dir stored outside it. `restore` requires all shards stopped.
- **Server install** (`dst/steamcmd.ts`): `downloadServer()` fetches the `steamcmd.zip` bootstrapper (only on first run), extracts it with the same system `tar`, then runs `steamcmd +force_install_dir <installDir> +login anonymous +app_update 343050 validate +quit`, streaming output line-by-line. `BotApp.installServer()` runs it in the background (200-line log ring buffer) and only when the bot is **stopped**; the web UI polls `GET /api/server/status` for progress. Caveat: SteamCMD `force_install_dir` is unreliable when the path contains spaces.

## Config

- All runtime config lives in **`config.json`** (gitignored — contains secrets). There is **no `.env`**. It is created/edited through the web UI setup page; `config.ts` loads it and fills defaults. Don't reintroduce env-var config.
- `missingRequired()` in `config.ts` defines what must be set before the bot can start: Discord token, client ID, guild ID, DST cluster. **`installDir` / `persistentRoot` / `confDir` are no longer user input** — `loadConfig()` always derives them from `appBaseDir()` (`installDir = games/DoNotStarveTogether/server`, `persistentRoot = games/DoNotStarveTogether`, `confDir = "clusters"`), ignoring any stored values. They remain fields on `DSTConfig` so `paths.ts`/`backup.ts`/`shards.ts` are unchanged.
- Note the README is in Thai and partially stale (e.g. paths). When README and code disagree, trust the code.
- Other generated/gitignored runtime files: `channels.json` (provisioned Discord channel IDs), `mods-cache.json`, web auth token (persisted into `config.json` on first boot).

## Conventions

- ESM with explicit `.js` import extensions (bun/tsc `NodeNext` resolution) even though sources are `.ts` — keep this.
- `strict` TypeScript; prefer the existing style of `satisfies` for event payloads and narrow helper functions (`str`/`s`) for sanitizing untrusted input.
