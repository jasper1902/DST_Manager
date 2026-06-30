# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A manager for a **Don't Starve Together (DST) dedicated server**, controlled via a **Discord bot** and a **local web UI**. Runs on **bun** (TypeScript executed directly, no Node/transpile step) as a single process. Most comments and user-facing strings are in Thai; match that when editing existing files.

**Target platform: Windows 11.** This project is developed and run on a Windows 11 base. Assume a Windows environment — use Windows-native tooling and conventions (PowerShell, `taskkill /T /F`, backslash paths, the bundled `tar`, `dst-manager.exe`). The Linux/macOS notes in this file are incidental; Windows 11 is the primary and only supported development/runtime target.

**Runtime: bun.** [bun](https://bun.sh) is the runtime — TypeScript (`.ts`) is executed directly, no Node.js and no transpile/build step for development. Use `bun` for everything (`bun install`, `bun start`, `bun run typecheck`, `bun --compile` for the standalone exe); do not assume `node`/`npm` are present.

Core idea: there is **no RCON**. The manager supervises the DST server binary as a child process, sends Lua console commands via **stdin** (`-console` flag), reads `stdout`/`stderr` line-by-line, and edits `cluster.ini` directly. Because it spawns the real binary, **the bot must run on the same machine/user as the DST install**.

The server binary is **not** installed manually — the manager **auto-downloads it via SteamCMD** (app id `343050`, `login anonymous`) from a button in the web UI. Everything lives next to the executable in a fixed layout (`appBaseDir()` in `dst/paths.ts` = the exe's folder when compiled, else cwd):

```
dst-manager.exe / config.json / channels.json / mods-cache.json
steamcmd/                              # SteamCMD bootstrapper + workshop downloads (steamapps/workshop/content/322330/<id>)
games/DoNotStarveTogether/
  server/                              # the dedicated server  → DSTConfig.installDir
    bin64/dontstarve_dedicated_server_nullrenderer_x64.exe
    mods/                              # dedicated_server_mods_setup.lua + workshop-<id> (provisioned mods)
    ugc_mods/<cluster>/Master/...      # UGC mods the engine downloads on boot
  clusters/<cluster>/                  # cluster data: cluster.ini, cluster_token.txt, Master/Caves
backups/                               # .tar.gz cluster backups
imports/                               # staging for world import (uploads + extract) — gitignored
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
   └─ BotApp (app.ts) ─ start/stop lifecycle of the bot half; owns config + background jobs
        │                (installServer / importWorld / provisionMods — all require bot STOPPED,
        │                 each a {running,done,error,log,progress,phase} snapshot the web polls)
        ├─ DSTManager (dst/manager.ts)  ◄── THE CORE. No knowledge of Discord/web.
        │     ├─ ShardProcess[] (dst/process.ts)  one supervised child proc per shard
        │     ├─ scheduler.ts  optional daily auto-restart
        │     └─ helpers: backup, mods, clusterConfig, clusterToken, clusterScaffold, modsSetup,
        │                 importer, archive, steamcmd, console, logParser, paths, shards
        ├─ Discord client (discord/bot.ts)  ── adapter: interaction → manager (slash + buttons + modals)
        └─ web server (web/server.ts)        ── adapter: HTTP /api/* → manager / BotApp jobs
```

All user-facing strings go through **i18n** (`src/i18n.ts`, `makeT(lang)`): default English, Thai
second, language stored in `config.language` and switchable from the web UI header. The web page
(`web/page.ts`) carries its own client-side `I18N` dict. Internal comments / `console.log` stay Thai.

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
- **Server install** (`dst/steamcmd.ts`): `downloadServer()` fetches the `steamcmd.zip` bootstrapper (only on first run), extracts it (Windows zip → **PowerShell `Expand-Archive`**, because the `tar` in PATH may be GNU tar which can't read zip; `.tar.gz` → system `tar`), then runs `steamcmd +force_install_dir <installDir> +login anonymous +app_update 343050 validate +quit`, streaming output line-by-line (split on `\r` too — SteamCMD redraws progress with carriage returns). First run self-updates and exits **code 7** → retried automatically. `BotApp.installServer()` runs it in the background (200-line log ring buffer) only when the bot is **stopped**; web polls `GET /api/server/status`. Caveat: `force_install_dir` is unreliable when the path has spaces.
- **Start guards + scaffolding** (`dst/manager.ts` `start()`): refuses to start unless the server binary exists **and** `cluster_token.txt` is present (`dst/clusterToken.ts` — the Klei server token, editable in the web UI). Then it auto-creates any missing `cluster.ini` / per-shard `server.ini` (`dst/clusterScaffold.ts`) and syncs `dedicated_server_mods_setup.lua` from `modoverrides.lua` (`dst/modsSetup.ts`) so the engine downloads/uses workshop mods via UGC on boot.
- **Mod provisioning** (`dst/modsSetup.ts` + `dst/steamcmd.ts`): optional `BotApp.provisionMods()` (background, bot stopped) registers the cluster's enabled workshop ids, downloads them via `steamcmd +workshop_download_item 322330 <id> +login anonymous` (no game boot needed), then copies each into `<install>/mods/workshop-<id>`. `syncModsSetup` respects a hand-written `dedicated_server_mods_setup.lua` (only regenerates files it marked).
- **World import** (`dst/importer.ts` + `dst/archive.ts`): `BotApp.importWorld()` (background, bot stopped) imports a cluster from an uploaded `.zip`/`.tar.gz` (streamed to `imports/`) or a local folder path. **Secure by default**: validates every archive entry before extracting (rejects path-traversal / drive-letter / reserved names / symlinks / over-cap counts+size), then **applies an allow-list only** (`cluster.ini`, `<Shard>/server.ini`, `<Shard>/save/**`, mod Lua only in Full mode — never `cluster_token.txt` or executables). Modes: **Full** (incl. mods) / **No-mods** (strips Lua), optional **regenerate** (drop `save/`). Backs up the current cluster first and rolls back on failure.
- **i18n** (`src/i18n.ts`): all Discord/web user strings via `makeT(lang)`; default `en`, second `th`, from `config.language`. Web `page.ts` has its own client `I18N` dict + a header language selector (`POST /api/lang` persists it; Discord picks it up on next bot start).

## Config

- All runtime config lives in **`config.json`** (gitignored — contains secrets). There is **no `.env`**. It is created/edited through the web UI setup page; `config.ts` loads it and fills defaults. Don't reintroduce env-var config.
- `missingRequired()` in `config.ts` defines what must be set before the bot can **start**: Discord token, client ID, guild ID, DST cluster. (Separately, `manager.start()` also needs the server installed + `cluster_token.txt` present — see Start guards above.) **`installDir` / `persistentRoot` / `confDir` are no longer user input** — `loadConfig()` always derives them from `appBaseDir()` (`installDir = games/DoNotStarveTogether/server`, `persistentRoot = games/DoNotStarveTogether`, `confDir = "clusters"`), ignoring any stored values. They remain fields on `DSTConfig` so `paths.ts`/`backup.ts`/`shards.ts` are unchanged.
- `config.language` (`"en" | "th"`, default `"en"`) drives all UI/bot strings; set via the web UI header (`POST /api/lang`).
- Note the README is in Thai and partially stale (e.g. paths). When README and code disagree, trust the code.
- Other generated/gitignored runtime files: `channels.json` (provisioned Discord channel IDs), `mods-cache.json`, web auth token (persisted into `config.json` on first boot).

## Adapters (web UI + Discord)

- **Web UI** (`web/page.ts`, a single served HTML string): organized for non-programmers into 3 client-side sections — **🏠 Home** (state-driven hero: one big context-aware action, players/day/season, with a one-click start that boots the bot then auto-starts the game), **🧙 Setup** (a 4-step wizard: install server → connect Discord & name world → server token → start), **⚙️ Advanced** (full `config.json` form, `cluster.ini` editor, Import World, Mods + the "download/set up mods" button, raw status/logs, system on/off). The config form is split basic↔advanced but every input stays in the DOM so one Save submits the whole config. API surface: `/api/bot/*`, `/api/status`, `/api/control`, `/api/server/*`, `/api/setup`, `/api/lang`, `/api/token`, `/api/import*`, `/api/mods/provision*`, `/api/config`, `/api/mods`.
- **Discord** (`discord/bot.ts` + `controlPanel.ts`): slash commands **and** a control-panel message of buttons (`ctrl:<action>`) routed through `runControlAction`; input commands (announce, config set) open **modals** (`isModalSubmit` → `handleModal`); rollback/regenerate reuse the slash confirm flow (`doRollback`/`doRegenerate` accept any `RepliableInteraction`). `restore` stays slash-only.

## Conventions

- ESM with explicit `.js` import extensions (bun/tsc `NodeNext` resolution) even though sources are `.ts` — keep this.
- `strict` TypeScript; prefer the existing style of `satisfies` for event payloads and narrow helper functions (`str`/`s`) for sanitizing untrusted input.
