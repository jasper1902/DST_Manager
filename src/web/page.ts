/** หน้า web UI: ออกแบบให้ผู้ใช้ทั่วไปใช้ง่าย — 3 ส่วน: 🏠 Home · 🧙 Setup · ⚙️ Advanced
 *  i18n ฝั่ง client (ดีฟอลต์อังกฤษ สลับไทยได้), เก็บภาษาใน config.json */
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DST Manager</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = { theme: { extend: { fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] } } } };
</script>
<style type="text/tailwindcss">
  :root { color-scheme: dark; }
  @layer base {
    body {
      @apply min-h-screen text-slate-100 antialiased;
      background:
        radial-gradient(900px circle at 15% -10%, rgba(99,102,241,.18), transparent 45%),
        radial-gradient(900px circle at 100% 0%, rgba(16,185,129,.12), transparent 40%),
        #0b0f1a;
    }
  }
  @layer components {
    .card { @apply bg-slate-900/60 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-5 mb-5 shadow-xl shadow-black/30; }
    .card h2 { @apply m-0 mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2; }
    .card h3 { @apply mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300/70; }
    table { @apply w-full border-collapse text-sm; }
    th, td { @apply text-left py-2.5 px-2 border-b border-slate-800/70; }
    th { @apply text-slate-400 font-medium text-xs uppercase tracking-wide; }
    .row { @apply flex items-center gap-3 mb-2.5; }
    .row label { @apply w-52 text-[13px] text-slate-400 flex-none; }
    .row input, .row select { @apply flex-1 w-full bg-slate-950/70 text-slate-100 border border-slate-700/70 rounded-lg px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30; }
    .finput { @apply w-full bg-slate-950/70 text-slate-100 border border-slate-700/70 rounded-lg px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30; }
    .codearea { @apply w-full bg-slate-950/70 text-slate-200 border border-slate-700/70 rounded-lg px-3 py-2 text-xs font-mono outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 resize-y; }
    button { @apply inline-flex items-center gap-1.5 bg-indigo-600 text-white border-0 rounded-lg px-3.5 py-2 cursor-pointer text-[13px] font-medium transition-all hover:bg-indigo-500 active:scale-[.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 disabled:active:scale-100; }
    button.danger { @apply bg-rose-600 hover:bg-rose-500 disabled:hover:bg-rose-600; }
    button.ghost { @apply bg-slate-700 hover:bg-slate-600 disabled:hover:bg-slate-700; }
    button.ok { @apply bg-emerald-600 hover:bg-emerald-500 disabled:hover:bg-emerald-600; }
    button.big { @apply px-6 py-3 text-base rounded-xl font-semibold; }
    .clsave { @apply bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs flex-none; }
    .controls { @apply flex gap-2 flex-wrap items-center; }
    .stepnum { @apply inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-200 text-xs font-bold ring-1 ring-inset ring-indigo-500/40 flex-none; }
    pre { @apply bg-slate-950/70 p-3 rounded-lg overflow-auto text-xs text-slate-300; }
    .badge { @apply inline-flex items-center px-3 py-1 rounded-full text-[13px] font-semibold ring-1 ring-inset ring-white/10; }
    .b-stopped { @apply bg-slate-600/80 text-slate-100; }
    .b-running { @apply bg-emerald-600/90 text-white shadow-lg shadow-emerald-500/20; }
    .b-starting, .b-stopping { @apply bg-amber-600/90 text-white; }
    #worldinfo, #players { @apply text-sm text-slate-400 my-1; }
    #toast { @apply fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 px-4 py-2.5 rounded-xl opacity-0 transition-opacity duration-300 text-[13px] max-w-[90%] z-50 shadow-2xl; }
    .muted { @apply text-slate-500 text-xs; }
    .warn { @apply text-amber-400 text-[13px]; }
    #lang { @apply bg-slate-950/70 text-slate-200 border border-slate-700/70 rounded-lg px-2 py-1 text-[13px] outline-none focus:border-indigo-500; }
    .tab { @apply bg-transparent text-slate-400 rounded-lg px-3.5 py-1.5 text-sm font-medium flex-none hover:bg-slate-800/60 hover:text-slate-200; }
    .tab.active { @apply bg-indigo-600/20 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-600/25; }
  }
</style>
</head>
<body class="font-sans">
<header class="sticky top-0 z-20 backdrop-blur-md bg-slate-950/60 border-b border-slate-800/80">
  <div class="px-6 py-4 flex items-center gap-2.5 text-lg font-semibold">
    <span class="text-2xl">🌳</span>
    <span class="bg-gradient-to-r from-emerald-300 via-teal-300 to-indigo-300 bg-clip-text text-transparent">DST Manager</span>
    <span class="flex-1"></span>
    <span class="muted hidden sm:inline" data-i18n="lang_label">Language</span>
    <select id="lang" title="Language / ภาษา">
      <option value="en">English</option>
      <option value="th">ไทย</option>
    </select>
  </div>
  <nav id="tabs" class="flex gap-1 px-4 pb-2 overflow-x-auto">
    <button class="tab" data-tab="home" data-i18n="nav_home">🏠 Home</button>
    <button class="tab" data-tab="setup" data-i18n="nav_setup">🧙 Setup</button>
    <button class="tab" data-tab="advanced" data-i18n="nav_advanced">⚙️ Advanced</button>
  </nav>
</header>
<main class="max-w-3xl mx-auto p-5">
  <div id="errbar" class="hidden items-start gap-3 bg-rose-950/60 border border-rose-500/50 text-rose-200 rounded-xl px-4 py-3 mb-5 text-sm shadow-lg shadow-rose-900/30">
    <span class="text-lg leading-none mt-0.5">⚠️</span>
    <span id="errmsg" class="flex-1 break-words whitespace-pre-wrap"></span>
    <button id="errclose" class="ghost !bg-transparent hover:!bg-rose-500/20 !text-rose-200 !px-2 !py-1 -mt-1 -mr-1">✕</button>
  </div>

  <!-- ───────── HOME ───────── -->
  <section data-tab="home">
    <div class="card">
      <div class="flex flex-col items-center text-center py-6 gap-3">
        <div class="flex items-center gap-3">
          <span id="home-dot" class="inline-block w-3.5 h-3.5 rounded-full bg-slate-500"></span>
          <span id="home-status" class="text-2xl font-bold">…</span>
        </div>
        <div id="home-sub" class="text-slate-400 text-sm"></div>
        <div id="home-primary" class="flex gap-2 flex-wrap justify-center mt-2"></div>
        <div id="home-players" class="text-sm text-slate-400 mt-1"></div>
        <div id="home-quick" class="hidden gap-2 mt-2">
          <button id="home-save" class="ghost" data-i18n="home_save">💾 Save</button>
          <button id="home-backup" class="ghost" data-i18n="home_backup">🗄️ Backup</button>
        </div>
        <div id="home-hint" class="warn mt-1"></div>
      </div>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_serverlog">📜 Server log (live)</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_serverlog_note">(auto-refreshing)</span></h2>
      <div class="controls mb-2">
        <span class="text-sm text-slate-400" data-i18n="log_shard">Shard:</span>
        <select id="log-shard"></select>
        <label class="flex items-center gap-1.5 text-[13px] text-slate-400"><input id="log-follow" type="checkbox" checked> <span data-i18n="log_follow">follow newest</span></label>
      </div>
      <pre id="serverlog" class="max-h-96">—</pre>
    </div>
  </section>

  <!-- ───────── SETUP (wizard) ───────── -->
  <section data-tab="setup">
    <div class="text-slate-400 text-sm mb-4 px-1" data-i18n="setup_intro">Follow these 4 steps to get your server running.</div>

    <div class="card">
      <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-200">
        <span class="stepnum">1</span> <span data-i18n="step1_title">Install the game server</span>
        <span id="step1-status" class="ml-auto text-xs font-normal"></span>
      </div>
      <div class="controls">
        <span class="text-sm text-slate-400" data-i18n="status_label">Status:</span> <span id="srvstate" class="text-sm text-slate-300">…</span>
        <button id="btn-install" class="ok" data-i18n="btn_install">⬇️ Download/update DST server</button>
      </div>
      <div id="srvnote" class="muted mt-2"></div>
      <div id="srvbar-wrap" class="hidden mt-3">
        <div class="flex justify-between text-xs text-slate-400 mb-1">
          <span data-i18n="dl_progress">Download / update progress</span>
          <span id="srvbar-pct" class="tabular-nums">0%</span>
        </div>
        <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div id="srvbar" class="h-full bg-emerald-500 transition-all duration-300 ease-out" style="width:0%"></div>
        </div>
      </div>
      <pre id="srvlog" class="hidden mt-3 max-h-64"></pre>
    </div>

    <div class="card">
      <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-200">
        <span class="stepnum">2</span> <span data-i18n="step2_title">Connect Discord & name your world</span>
        <span id="step2-status" class="ml-auto text-xs font-normal"></span>
      </div>
      <div id="setup-basic"></div>
      <div class="controls mt-3">
        <button id="btn-save" class="ok" data-i18n="btn_save_config">💾 Save</button>
        <span id="setupnote" class="muted"></span>
      </div>
    </div>

    <div class="card">
      <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-200">
        <span class="stepnum">3</span> <span data-i18n="step3_title">Server token</span>
        <span id="step3-status" class="ml-auto text-xs font-normal"></span>
      </div>
      <div id="tokenstate" class="text-sm mb-2 text-slate-400">—</div>
      <input id="cltoken" class="finput" type="text" placeholder="pds-g1-xxxxxxxx... / KU_xxxxxxxx...">
      <div class="controls mt-2">
        <button id="btn-token-save" class="ok" data-i18n="btn_save_token">💾 Save token</button>
        <a href="https://accounts.klei.com" target="_blank" rel="noopener" class="text-sky-400 hover:underline text-[13px]" data-i18n="token_get_link">Get a server token ↗</a>
      </div>
    </div>

    <div class="card">
      <div class="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-200">
        <span class="stepnum">4</span> <span data-i18n="step4_title">Start!</span>
        <span id="step4-status" class="ml-auto text-xs font-normal"></span>
      </div>
      <button id="btn-gohome" class="ok big" data-i18n="step4_btn">🏠 Go to Home & start</button>
    </div>
  </section>

  <!-- ───────── ADVANCED ───────── -->
  <section data-tab="advanced">
    <div class="text-slate-400 text-sm mb-4 px-1" data-i18n="adv_caption">Advanced settings — for power users.</div>

    <div class="card">
      <h2><span data-i18n="sys_title">🤖 System (Discord bot)</span></h2>
      <div class="controls">
        <span class="text-sm text-slate-400" data-i18n="status_label">Status:</span> <span id="botstate" class="badge b-stopped">...</span>
        <button id="btn-run" class="ok" data-i18n="btn_run">▶️ Run bot</button>
        <button id="btn-stop" class="danger" data-i18n="btn_stop">⏹️ Stop</button>
        <button id="btn-rebot" class="ghost" data-i18n="btn_rebot">🔄 restart</button>
      </div>
      <div class="muted mt-2" data-i18n="lang_note">Note: the web UI switches language instantly; Discord applies it after the next bot restart.</div>
      <div id="missing" class="warn mt-3"></div>
    </div>

    <div class="card">
      <h2><span data-i18n="adv_config_title">⚙️ All settings (config.json)</span></h2>
      <div id="setup-adv" class="text-slate-400 text-sm" data-i18n="loading">Loading...</div>
      <div class="controls mt-4">
        <button id="btn-save-adv" data-i18n="btn_save_config">💾 Save config</button>
        <span id="setupnote-adv" class="muted"></span>
      </div>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_cluster">📝 cluster.ini</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_cluster_note">(takes effect on DST restart)</span></h2>
      <div id="cluster" class="text-slate-400 text-sm">—</div>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_import">📦 Import World</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_import_note">(bot must be stopped — overwrites current cluster)</span></h2>
      <div id="importstate" class="warn mb-2"></div>
      <div class="row"><label data-i18n="imp_source">Source</label>
        <select id="imp-kind">
          <option value="archive" data-i18n="imp_src_archive">Upload archive (.zip/.tar.gz)</option>
          <option value="folder" data-i18n="imp_src_folder">Local folder path</option>
        </select>
      </div>
      <div class="row" id="imp-file-row"><label data-i18n="imp_file">Archive file</label>
        <input id="imp-file" type="file" accept=".zip,.tar.gz,.tgz">
      </div>
      <div class="row hidden" id="imp-path-row"><label data-i18n="imp_path">Folder path</label>
        <input id="imp-path" type="text" placeholder="C:\\path\\to\\Cluster_1">
      </div>
      <div class="row"><label data-i18n="imp_mode">Mode</label>
        <select id="imp-mode">
          <option value="full" data-i18n="imp_mode_full">Full (include mods)</option>
          <option value="no-mods" data-i18n="imp_mode_nomods">No-mods (strip Lua)</option>
        </select>
      </div>
      <div id="imp-warn" class="warn mb-2" data-i18n="imp_full_warn">⚠️ Full mode runs Lua from the world's author — import only worlds you trust.</div>
      <label class="flex items-center gap-2 text-[13px] text-slate-400 mb-3"><input id="imp-regen" type="checkbox"> <span data-i18n="imp_regen">Regenerate world (drop imported save)</span></label>
      <div class="controls">
        <button id="btn-import" class="danger" data-i18n="btn_import">📦 Import</button>
      </div>
      <div id="impbar-wrap" class="hidden mt-3">
        <div class="flex justify-between text-xs text-slate-400 mb-1"><span data-i18n="imp_progress">Import progress</span><span id="impbar-pct" class="tabular-nums">0%</span></div>
        <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden"><div id="impbar" class="h-full bg-emerald-500 transition-all duration-300 ease-out" style="width:0%"></div></div>
      </div>
      <pre id="implog" class="hidden mt-3 max-h-64"></pre>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_status">📊 Server status</span></h2>
      <div id="shards" class="text-slate-400 text-sm">—</div>
      <div id="worldinfo"></div>
      <div id="players"></div>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_mods">🧩 Mods in use</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_mods_note">(from modoverrides.lua)</span></h2>
      <div id="mods" class="text-slate-400 text-sm">—</div>
      <div class="muted mt-3" data-i18n="mods_provision_note">Register & download this world's mods via SteamCMD into mods/workshop-&lt;id&gt; (bot must be stopped).</div>
      <div id="modsetupstate" class="warn"></div>
      <div class="controls mt-2">
        <button id="btn-mods-setup" data-i18n="btn_mods_setup">🧩 Download / set up mods</button>
      </div>
      <div id="modbar-wrap" class="hidden mt-3">
        <div class="flex justify-between text-xs text-slate-400 mb-1"><span data-i18n="mods_progress">Mod download progress</span><span id="modbar-pct" class="tabular-nums">0%</span></div>
        <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden"><div id="modbar" class="h-full bg-emerald-500 transition-all duration-300 ease-out" style="width:0%"></div></div>
      </div>
      <pre id="modlog" class="hidden mt-3 max-h-64"></pre>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_modsmgr">🧩 Mods manager</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_modsmgr_note">(enable/disable · add · config — takes effect on restart)</span></h2>
      <div class="controls mb-2">
        <span class="text-sm text-slate-400" data-i18n="mm_shard">Shard:</span>
        <select id="mm-shard"></select>
      </div>
      <div class="row">
        <label data-i18n="mm_add_label">Add by workshop id</label>
        <input id="mm-add-id" type="text" placeholder="378160973">
        <button class="clsave" id="btn-mm-add" data-i18n="admin_add">Add</button>
      </div>
      <div id="mm-list" class="mt-3 text-sm text-slate-400">—</div>
      <div id="mm-config" class="hidden mt-3 border-t border-slate-800 pt-3"></div>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_modoverrides">🧩 Mod config (modoverrides.lua)</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_modoverrides_note">(Lua — takes effect on restart)</span></h2>
      <div class="controls mb-2">
        <span class="text-sm text-slate-400" data-i18n="mo_shard">Shard:</span>
        <select id="mo-shard"></select>
        <span id="mo-state" class="muted"></span>
      </div>
      <textarea id="mo-content" class="codearea" rows="12" spellcheck="false" placeholder="return {}"></textarea>
      <div class="controls mt-2">
        <button id="btn-mo-save" data-i18n="btn_save_modoverrides">💾 Save modoverrides.lua</button>
      </div>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_worldgen">🌍 World settings (worldgenoverride.lua)</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_worldgen_note">(applies only when the world is regenerated)</span></h2>
      <div class="controls mb-2">
        <span class="text-sm text-slate-400" data-i18n="wg_shard">Shard:</span>
        <select id="wg-shard"></select>
        <label class="flex items-center gap-1.5 text-[13px] text-slate-400"><input id="wg-enabled" type="checkbox"> <span data-i18n="wg_enabled">enable overrides</span></label>
      </div>
      <div id="wg-form" class="text-sm text-slate-400">—</div>
      <div class="controls mt-2">
        <button id="btn-wg-save" class="ok" data-i18n="wg_save">💾 Save world settings</button>
      </div>
    </div>

    <div class="card">
      <h2><span data-i18n="sec_admins">👑 Admins (adminlist.txt)</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_admins_note">(in-game admins — takes effect on restart)</span></h2>
      <div id="adminlist" class="text-slate-400 text-sm mb-3">—</div>
      <div class="row">
        <label data-i18n="admin_from_player">Online player</label>
        <select id="admin-player"></select>
        <button class="clsave" id="btn-admin-add-player" data-i18n="admin_add">Add</button>
      </div>
      <div class="row">
        <label data-i18n="admin_game_id">Game ID</label>
        <input id="admin-id" type="text" placeholder="KU_xxxxxxxx">
        <button class="clsave" id="btn-admin-add-id" data-i18n="admin_add">Add</button>
      </div>
    </div>
  </section>
</main>
<div id="toast"></div>
<script>
  var I18N = {
    en: {
      lang_label: 'Language',
      lang_note: 'Note: the web UI switches language instantly; Discord applies it after the next bot restart.',
      nav_home: '🏠 Home', nav_setup: '🧙 Setup', nav_advanced: '⚙️ Advanced',
      home_off: 'Server is off', home_needsetup: 'Setup not complete', home_starting: 'Starting…', home_stopping: 'Stopping…',
      home_onidle: 'System on · game not running', home_online: 'ONLINE', home_players_word: 'players',
      home_go_setup: '⚙️ Go to Setup', home_start: '🟢 Start server', home_start_game: '▶️ Start the game',
      home_stop: '⏹️ Stop', home_restart: '🔄 Restart', home_poweroff: '⏼ Turn off system',
      home_sub_off: 'Press Start to launch your server', home_sub_onidle: 'System ready — start the game world',
      home_sub_setup: 'Finish the steps in Setup first', home_sub_starting: 'Please wait…', home_sub_stopping: 'Please wait…',
      home_save: '💾 Save', home_backup: '🗄️ Backup',
      setup_intro: 'Follow these 4 steps to get your server running.',
      step1_title: 'Install the game server', step2_title: 'Connect Discord & name your world',
      step3_title: 'Server token', step4_title: 'Start!',
      w_installed: 'installed', w_not_installed: 'not installed yet', w_discord_ok: 'Discord configured', w_discord_no: 'not configured',
      w_token_ok: 'token added', w_token_no: 'no token yet', w_running: 'running', w_not_running: 'not running',
      step4_btn: '🏠 Go to Home & start', adv_caption: 'Advanced settings — for power users.',
      sys_title: '🤖 System (Discord bot)', adv_config_title: '⚙️ All settings (config.json)', open_link: 'open ↗',
      f_bot_token: 'Discord Bot Token', f_bot_token_help: 'Discord Developer Portal → your app → Bot → Reset/Copy Token.',
      f_client_id: 'Application (Client) ID', f_client_id_help: 'Developer Portal → your app → General Information → Application ID.',
      f_guild_id: 'Discord Server ID', f_guild_id_help: 'Right-click your Discord server → Copy Server ID (enable Developer Mode first).',
      f_admin_role: 'Admin Role ID (optional)', f_admin_role_help: 'Only this role can use control commands. Empty = everyone (dev only).',
      f_cluster: 'World (cluster) name', f_cluster_help: 'A folder name for your world, e.g. MyServer. Created automatically if new.',
      sec_token: '🔑 Cluster Token', sec_token_note: '(required to start — get from accounts.klei.com)',
      lbl_cluster_token: 'cluster_token.txt', btn_save_token: '💾 Save token', token_get_link: 'Get a server token ↗',
      token_present: '✓ cluster_token.txt found', token_missing: '⚠️ No cluster_token.txt — add one to start the server',
      token_no_cluster: '⚠️ Set the world (cluster) name in step 2 first', token_saved: 'cluster_token.txt saved',
      sec_import: '📦 Import World', sec_import_note: '(bot must be stopped — overwrites current cluster)',
      imp_source: 'Source', imp_src_archive: 'Upload archive (.zip/.tar.gz)', imp_src_folder: 'Local folder path',
      imp_file: 'Archive file', imp_path: 'Folder path', imp_mode: 'Mode',
      imp_mode_full: 'Full (include mods)', imp_mode_nomods: 'No-mods (strip Lua)',
      imp_full_warn: '⚠️ Full mode runs Lua (modoverrides/worldgenoverride) from the world\\'s author — import only worlds you trust.',
      imp_regen: 'Regenerate world (drop imported save)', btn_import: '📦 Import', imp_progress: 'Import progress',
      imp_must_stop: '⚠️ Stop the bot before importing', imp_confirm: 'Import this world over the current cluster? (current cluster is backed up first)',
      imp_no_file: 'Choose an archive file first', imp_uploading: '⏳ Uploading...', imp_importing: '⏳ Importing...',
      imp_done: '✓ Import complete', imp_failed: '✗ Import failed: ', import_need_stop: '⚠️ Stop the bot to enable import',
      sec_status: '📊 Server status', sec_mods: '🧩 Mods in use', sec_mods_note: '(from modoverrides.lua)',
      mods_provision_note: "Register & download this world's mods via SteamCMD into mods/workshop-<id> (bot must be stopped).",
      btn_mods_setup: '🧩 Download / set up mods', mods_progress: 'Mod download progress',
      mods_need_stop: '⚠️ Stop the bot to set up mods', mods_confirm: "Download this world's mods via SteamCMD? (registers from modoverrides.lua, may take a while)",
      mods_provisioning: '⏳ Setting up mods...', mods_done: '✓ Mods set up', mods_failed: '✗ Mod setup failed: ',
      sec_modsmgr: '🧩 Mods manager', sec_modsmgr_note: '(enable/disable · add · config — takes effect on restart)',
      mm_shard: 'Shard:', mm_add_label: 'Add by workshop id', mm_none: 'No mods in this world',
      mm_no_config: 'This mod has no editable config (or is not downloaded yet) — use the raw editor below',
      mm_config_for: 'Config for', mm_config_saved: '✓ mod config saved', mm_remove_confirm: 'Remove this mod from the world?',
      sec_modoverrides: '🧩 Mod config (modoverrides.lua)', sec_modoverrides_note: '(Lua — takes effect on restart)',
      mo_shard: 'Shard:', btn_save_modoverrides: '💾 Save modoverrides.lua',
      mo_saved: '✓ modoverrides.lua saved', mo_load_err: "Can't read modoverrides.lua: ",
      sec_worldgen: '🌍 World settings (worldgenoverride.lua)', sec_worldgen_note: '(applies only when the world is regenerated)',
      wg_shard: 'Shard:', wg_enabled: 'enable overrides', wg_save: '💾 Save world settings', wg_saved: '✓ world settings saved',
      sec_serverlog: '📜 Server log (live)', sec_serverlog_note: '(auto-refreshing)',
      log_shard: 'Shard:', log_follow: 'follow newest', log_not_running: 'Server is not running', log_all: 'All shards',
      sec_admins: '👑 Admins (adminlist.txt)', sec_admins_note: '(in-game admins — takes effect on restart)',
      admin_from_player: 'Online player', admin_game_id: 'Game ID', admin_add: 'Add',
      admin_none: 'No admins yet', admin_no_players: '(no players online)', admin_need_running: '(start the server to list players)',
      admin_added: '✓ admin added', admin_removed: '✓ admin removed',
      sec_cluster: '📝 cluster.ini', sec_cluster_note: '(takes effect on DST restart)',
      status_label: 'Status:', btn_run: '▶️ Run bot', btn_stop: '⏹️ Stop', btn_rebot: '🔄 restart',
      btn_save_config: '💾 Save config', btn_install: '⬇️ Download/update DST server',
      loading: 'Loading...', save: 'Save',
      prompt_token: 'Enter the web token (see the console where you ran bun start):',
      token_wrong: 'wrong token — try again', saved_config: 'Saved',
      still_missing: 'still missing: ', complete: '✓ complete',
      still_incomplete: '⚠️ Not fully configured: ', disconnected: '🔌 Lost connection to DST Manager — the server may be down',
      bot_not_running: "the bot isn't running", offline: 'Offline', day_prefix: 'Day',
      mods_none_file: 'No mods enabled (modoverrides.lua not found)',
      mods_none_enabled: 'Mod file exists but no mods are enabled',
      enabled_suffix: 'enabled', mods_read_error: "Can't read mods: ",
      cluster_read_error: "Can't read cluster.ini (set the world name + download the server first): ",
      cluster_sensitive_ph: '(hidden — type to change)',
      secret_set_ph: '(set — type to change)', secret_unset_ph: '(not set)',
      dl_progress: 'Download / update progress',
      confirm_action: 'Confirm ', installed: '✓ installed', not_installed: 'not installed',
      install_failed: '✗ install failed: ', install_done: '✓ DST server install complete',
      must_stop_to_install: '⚠️ Stop the bot before you can install',
      confirm_install: 'Download/update the DST server via SteamCMD? (may take several minutes)',
      installing: '⏳ Starting install...',
      lbl_channelCategory: 'Channel category', lbl_logChannelName: 'Log channel name',
      lbl_statusTextChannelName: 'Status channel name', lbl_controlChannelName: 'Control channel name',
      lbl_actionLogChannelName: 'Action log channel name',
      lbl_shards: 'Shards (comma, empty=auto)',
      lbl_msgInterval: 'embed interval (sec)', lbl_nameInterval: 'voice name interval (sec)',
      lbl_showPassword: 'Show password in embed', lbl_backupKeep: 'How many files to keep',
      lbl_autoRestart: 'Auto-restart on crash', lbl_dailyRestart: 'Daily restart HH:MM (empty=off)',
    },
    th: {
      lang_label: 'ภาษา',
      lang_note: 'หมายเหตุ: web UI สลับภาษาทันที ส่วน Discord จะเปลี่ยนตอน restart บอทครั้งถัดไป',
      nav_home: '🏠 หน้าหลัก', nav_setup: '🧙 ตั้งค่า', nav_advanced: '⚙️ ขั้นสูง',
      home_off: 'เซิร์ฟเวอร์ปิดอยู่', home_needsetup: 'ยังตั้งค่าไม่ครบ', home_starting: 'กำลังเริ่ม…', home_stopping: 'กำลังหยุด…',
      home_onidle: 'ระบบเปิด · เกมยังไม่รัน', home_online: 'กำลังออนไลน์', home_players_word: 'ผู้เล่น',
      home_go_setup: '⚙️ ไปตั้งค่า', home_start: '🟢 เปิดเซิร์ฟเวอร์', home_start_game: '▶️ เริ่มเซิร์ฟเวอร์เกม',
      home_stop: '⏹️ หยุด', home_restart: '🔄 รีสตาร์ท', home_poweroff: '⏼ ปิดระบบ',
      home_sub_off: 'กดเริ่มเพื่อเปิดเซิร์ฟเวอร์', home_sub_onidle: 'ระบบพร้อม — กดเริ่มเซิร์ฟเวอร์เกม',
      home_sub_setup: 'ไปทำขั้นตอนในหน้า Setup ให้ครบก่อน', home_sub_starting: 'รอสักครู่…', home_sub_stopping: 'รอสักครู่…',
      home_save: '💾 เซฟ', home_backup: '🗄️ Backup',
      setup_intro: 'ทำตาม 4 ขั้นตอนเพื่อเปิดเซิร์ฟเวอร์',
      step1_title: 'ติดตั้งเกมเซิร์ฟเวอร์', step2_title: 'เชื่อม Discord & ตั้งชื่อโลก',
      step3_title: 'Server token', step4_title: 'เริ่ม!',
      w_installed: 'ติดตั้งแล้ว', w_not_installed: 'ยังไม่ได้ติดตั้ง', w_discord_ok: 'ตั้งค่า Discord ครบ', w_discord_no: 'ยังไม่ครบ',
      w_token_ok: 'ใส่ token แล้ว', w_token_no: 'ยังไม่มี token', w_running: 'กำลังรัน', w_not_running: 'ยังไม่รัน',
      step4_btn: '🏠 ไปหน้าหลัก & เริ่ม', adv_caption: 'ตั้งค่าขั้นสูง — สำหรับผู้ใช้ที่ชำนาญ',
      sys_title: '🤖 ระบบ (Discord bot)', adv_config_title: '⚙️ ตั้งค่าทั้งหมด (config.json)', open_link: 'เปิด ↗',
      f_bot_token: 'Discord Bot Token', f_bot_token_help: 'เอาจาก Discord Developer Portal → แอปของคุณ → Bot → Reset/Copy Token',
      f_client_id: 'Application (Client) ID', f_client_id_help: 'Developer Portal → แอปของคุณ → General Information → Application ID',
      f_guild_id: 'Discord Server ID', f_guild_id_help: 'คลิกขวาไอคอนเซิร์ฟเวอร์ Discord → Copy Server ID (เปิด Developer Mode ก่อน)',
      f_admin_role: 'Admin Role ID (ไม่บังคับ)', f_admin_role_help: 'เฉพาะ role นี้ใช้คำสั่งควบคุมได้ เว้นว่าง = ทุกคนใช้ได้ (เหมาะกับ dev)',
      f_cluster: 'ชื่อโลก (cluster)', f_cluster_help: 'ชื่อโฟลเดอร์ของโลก เช่น MyServer ถ้ายังไม่มีจะสร้างให้อัตโนมัติ',
      sec_token: '🔑 Cluster Token', sec_token_note: '(จำเป็นต่อการ start — ขอได้ที่ accounts.klei.com)',
      lbl_cluster_token: 'cluster_token.txt', btn_save_token: '💾 บันทึก token', token_get_link: 'ขอ server token ↗',
      token_present: '✓ พบ cluster_token.txt', token_missing: '⚠️ ไม่มี cluster_token.txt — ใส่ก่อนถึงจะเปิดเซิร์ฟเวอร์ได้',
      token_no_cluster: '⚠️ ตั้งชื่อโลก (cluster) ในขั้นที่ 2 ก่อน', token_saved: 'บันทึก cluster_token.txt แล้ว',
      sec_import: '📦 Import World', sec_import_note: '(ต้องหยุดบอทก่อน — เขียนทับ cluster ปัจจุบัน)',
      imp_source: 'แหล่งที่มา', imp_src_archive: 'อัปโหลด archive (.zip/.tar.gz)', imp_src_folder: 'path โฟลเดอร์ในเครื่อง',
      imp_file: 'ไฟล์ archive', imp_path: 'path โฟลเดอร์', imp_mode: 'โหมด',
      imp_mode_full: 'Full (เอา mod ด้วย)', imp_mode_nomods: 'No-mods (ตัด Lua)',
      imp_full_warn: '⚠️ โหมด Full จะรัน Lua (modoverrides/worldgenoverride) ของผู้สร้าง world — import เฉพาะ world ที่ไว้ใจ',
      imp_regen: 'สร้างโลกใหม่ (ทิ้ง save ที่ import มา)', btn_import: '📦 Import', imp_progress: 'ความคืบหน้า import',
      imp_must_stop: '⚠️ หยุดบอทก่อนถึงจะ import ได้', imp_confirm: 'import world นี้ทับ cluster ปัจจุบัน? (จะ backup ของเดิมก่อน)',
      imp_no_file: 'เลือกไฟล์ archive ก่อน', imp_uploading: '⏳ กำลังอัปโหลด...', imp_importing: '⏳ กำลัง import...',
      imp_done: '✓ import เสร็จแล้ว', imp_failed: '✗ import ไม่สำเร็จ: ', import_need_stop: '⚠️ หยุดบอทเพื่อเปิดให้ import',
      sec_status: '📊 สถานะ server', sec_mods: '🧩 ม็อดที่ใช้', sec_mods_note: '(จาก modoverrides.lua)',
      mods_provision_note: 'ลงทะเบียน & ดาวน์โหลดม็อดของโลกนี้ผ่าน SteamCMD ไปไว้ที่ mods/workshop-<id> (ต้องหยุดบอทก่อน)',
      btn_mods_setup: '🧩 ดาวน์โหลด / ติดตั้งม็อด', mods_progress: 'ความคืบหน้าโหลดม็อด',
      mods_need_stop: '⚠️ หยุดบอทก่อนถึงจะติดตั้งม็อดได้', mods_confirm: 'ดาวน์โหลดม็อดของโลกนี้ผ่าน SteamCMD? (อ่านจาก modoverrides.lua อาจใช้เวลาสักครู่)',
      mods_provisioning: '⏳ กำลังติดตั้งม็อด...', mods_done: '✓ ติดตั้งม็อดเสร็จ', mods_failed: '✗ ติดตั้งม็อดไม่สำเร็จ: ',
      sec_modsmgr: '🧩 จัดการม็อด', sec_modsmgr_note: '(เปิด/ปิด · เพิ่ม · ตั้งค่า — มีผลตอน restart)',
      mm_shard: 'Shard:', mm_add_label: 'เพิ่มด้วย workshop id', mm_none: 'โลกนี้ยังไม่มีม็อด',
      mm_no_config: 'ม็อดนี้ไม่มี config ให้แก้ (หรือยังไม่ถูกดาวน์โหลด) — ใช้ raw editor ด้านล่างแทน',
      mm_config_for: 'ตั้งค่าม็อด', mm_config_saved: '✓ บันทึกค่าม็อดแล้ว', mm_remove_confirm: 'ลบม็อดนี้ออกจากโลก?',
      sec_modoverrides: '🧩 ตั้งค่าม็อด (modoverrides.lua)', sec_modoverrides_note: '(Lua — มีผลตอน restart)',
      mo_shard: 'Shard:', btn_save_modoverrides: '💾 บันทึก modoverrides.lua',
      mo_saved: '✓ บันทึก modoverrides.lua แล้ว', mo_load_err: 'อ่าน modoverrides.lua ไม่ได้: ',
      sec_worldgen: '🌍 ตั้งค่าโลก (worldgenoverride.lua)', sec_worldgen_note: '(มีผลเฉพาะตอนสร้างโลกใหม่ regenerate)',
      wg_shard: 'Shard:', wg_enabled: 'เปิดใช้ override', wg_save: '💾 บันทึกตั้งค่าโลก', wg_saved: '✓ บันทึกตั้งค่าโลกแล้ว',
      sec_serverlog: '📜 Log server (สด)', sec_serverlog_note: '(รีเฟรชอัตโนมัติ)',
      log_shard: 'Shard:', log_follow: 'ตามล่าสุด', log_not_running: 'server ไม่ได้รันอยู่', log_all: 'ทุก shard',
      sec_admins: '👑 Admin (adminlist.txt)', sec_admins_note: '(admin ในเกม — มีผลตอน restart)',
      admin_from_player: 'ผู้เล่นออนไลน์', admin_game_id: 'Game ID', admin_add: 'เพิ่ม',
      admin_none: 'ยังไม่มี admin', admin_no_players: '(ไม่มีผู้เล่นออนไลน์)', admin_need_running: '(เริ่ม server เพื่อดูรายชื่อผู้เล่น)',
      admin_added: '✓ เพิ่ม admin แล้ว', admin_removed: '✓ ลบ admin แล้ว',
      sec_cluster: '📝 cluster.ini', sec_cluster_note: '(มีผลตอน restart DST)',
      status_label: 'สถานะ:', btn_run: '▶️ รันบอท', btn_stop: '⏹️ หยุด', btn_rebot: '🔄 restart',
      btn_save_config: '💾 บันทึก config', btn_install: '⬇️ ดาวน์โหลด/อัปเดต DST server',
      loading: 'กำลังโหลด...', save: 'บันทึก',
      prompt_token: 'ใส่ Web token (ดูจาก console ที่รัน bun start):',
      token_wrong: 'token ผิด — ลองใหม่', saved_config: 'บันทึกแล้ว',
      still_missing: 'ยังขาด: ', complete: '✓ ครบ',
      still_incomplete: '⚠️ ยังกรอกไม่ครบ: ', disconnected: '🔌 ขาดการเชื่อมต่อกับ DST Manager — เซิร์ฟเวอร์อาจถูกปิดอยู่',
      bot_not_running: 'บอทยังไม่ได้รัน', offline: 'ออฟไลน์', day_prefix: 'วันที่',
      mods_none_file: 'ไม่ได้เปิดใช้ม็อด (ไม่พบ modoverrides.lua)',
      mods_none_enabled: 'มีไฟล์ม็อดแต่ไม่มีม็อดที่เปิดใช้',
      enabled_suffix: 'เปิดอยู่', mods_read_error: 'อ่านม็อดไม่ได้: ',
      cluster_read_error: 'อ่าน cluster.ini ไม่ได้ (ตั้งชื่อโลก + ดาวน์โหลด server ก่อน): ',
      cluster_sensitive_ph: '(ไม่แสดง — กรอกเพื่อเปลี่ยน)',
      secret_set_ph: '(ตั้งไว้แล้ว — กรอกเพื่อเปลี่ยน)', secret_unset_ph: '(ยังไม่ตั้ง)',
      dl_progress: 'ความคืบหน้าการดาวน์โหลด / อัปเดต',
      confirm_action: 'ยืนยัน ', installed: '✓ ติดตั้งแล้ว', not_installed: 'ยังไม่ได้ติดตั้ง',
      install_failed: '✗ ติดตั้งไม่สำเร็จ: ', install_done: '✓ ติดตั้ง DST server เสร็จแล้ว',
      must_stop_to_install: '⚠️ ต้องหยุดบอทก่อนถึงจะติดตั้งได้',
      confirm_install: 'ดาวน์โหลด/อัปเดต DST server ผ่าน SteamCMD ? (อาจใช้เวลาหลายนาที)',
      installing: '⏳ เริ่มติดตั้ง...',
      lbl_channelCategory: 'หมวดห้อง', lbl_logChannelName: 'ชื่อห้อง log',
      lbl_statusTextChannelName: 'ชื่อห้อง status', lbl_controlChannelName: 'ชื่อห้อง control',
      lbl_actionLogChannelName: 'ชื่อห้อง action log',
      lbl_shards: 'Shards (comma, เว้น=auto)',
      lbl_msgInterval: 'embed interval (วิ)', lbl_nameInterval: 'voice name interval (วิ)',
      lbl_showPassword: 'โชว์รหัสผ่านใน embed', lbl_backupKeep: 'เก็บกี่ไฟล์',
      lbl_autoRestart: 'Auto-restart เมื่อ crash', lbl_dailyRestart: 'Restart รายวัน HH:MM (เว้น=ปิด)',
    }
  };
  var LANG = localStorage.getItem('dstLang') || 'en';
  if(LANG !== 'en' && LANG !== 'th') LANG = 'en';
  function t(k){ var d = I18N[LANG] || I18N.en; return (d[k] != null) ? d[k] : (I18N.en[k] != null ? I18N.en[k] : k); }
  function el(id){ return document.getElementById(id); }
  function h(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function applyLang(){
    document.documentElement.lang = LANG;
    var nodes = document.querySelectorAll('[data-i18n]');
    for(var i=0;i<nodes.length;i++){ nodes[i].textContent = t(nodes[i].getAttribute('data-i18n')); }
    var sel = el('lang'); if(sel) sel.value = LANG;
  }

  var TAB = localStorage.getItem('dstTab') || 'home';
  function showTab(name){
    var secs = document.querySelectorAll('main > [data-tab]');
    var any = false;
    secs.forEach(function(s){ if(s.getAttribute('data-tab')===name) any = true; });
    if(!any) name = 'home';
    TAB = name;
    localStorage.setItem('dstTab', name);
    secs.forEach(function(s){ s.classList.toggle('hidden', s.getAttribute('data-tab')!==name); });
    document.querySelectorAll('#tabs .tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab')===name); });
    if(name==='advanced'){ loadAdmins(); loadModsManager(); loadWorldGen(); } // refresh admin + mods manager + world settings when opening Advanced
  }

  var TKEY = 'dstToken';
  function getToken(){ var t0 = localStorage.getItem(TKEY); if(!t0){ t0 = prompt(t('prompt_token')); if(t0) localStorage.setItem(TKEY, t0); } return t0 || ''; }
  function toast(m){ var t1 = el('toast'); t1.textContent = m; t1.style.opacity = '1'; setTimeout(function(){ t1.style.opacity='0'; }, 4500); }
  function showError(m){ var b = el('errbar'); el('errmsg').textContent = m; b.classList.remove('hidden'); b.classList.add('flex'); }
  function clearError(){ var b = el('errbar'); b.classList.add('hidden'); b.classList.remove('flex'); }
  function getByPath(o,p){ return p.split('.').reduce(function(a,k){ return a==null?undefined:a[k]; }, o); }
  function setByPath(o,p,v){ var ks=p.split('.'); var c=o; for(var i=0;i<ks.length-1;i++){ if(!c[ks[i]]) c[ks[i]]={}; c=c[ks[i]]; } c[ks[ks.length-1]]=v; }

  async function api(path, method, body){
    var res = await fetch(path, { method: method||'GET', headers: { 'x-dst-token': getToken(), 'content-type':'application/json' }, body: body?JSON.stringify(body):undefined });
    if(res.status === 401){ localStorage.removeItem(TKEY); alert(t('token_wrong')); location.reload(); throw new Error('unauthorized'); }
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || ('HTTP '+res.status));
    return data;
  }

  // ── shared state (ขับ Home + wizard) ──
  var BOT_STATE = 'stopped';
  var LAST_MISSING = [];
  var LAST_STATUS = null;
  var LAST_SERVER = { installed:false };
  var LAST_TOKEN = { has:false };
  var startIntent = false;
  var srvPolling = false;
  var impPolling = false;
  var modPolling = false;

  var SETUP = [
    { title:'Discord', fields:[
      {p:'discord.token', secret:true, flag:'discord.hasToken', grp:'basic', lk:'f_bot_token', help:'f_bot_token_help', link:'https://discord.com/developers/applications'},
      {p:'discord.clientId', grp:'basic', lk:'f_client_id', help:'f_client_id_help', link:'https://discord.com/developers/applications'},
      {p:'discord.guildId', grp:'basic', lk:'f_guild_id', help:'f_guild_id_help'},
      {p:'discord.adminRoleId', grp:'basic', lk:'f_admin_role', help:'f_admin_role_help'},
      {p:'discord.channelCategory', lk:'lbl_channelCategory'},
      {p:'discord.logChannelName', lk:'lbl_logChannelName'},
      {p:'discord.statusTextChannelName', lk:'lbl_statusTextChannelName'},
      {p:'discord.controlChannelName', lk:'lbl_controlChannelName'},
      {p:'discord.actionLogChannelName', lk:'lbl_actionLogChannelName'}
    ]},
    { title:'DST Server', fields:[
      {p:'dst.cluster', grp:'basic', lk:'f_cluster', help:'f_cluster_help'},
      {p:'dst.shards', lk:'lbl_shards'}
    ]},
    { title:'Status', fields:[
      {p:'status.messageIntervalSec', lk:'lbl_msgInterval', t:'number'},
      {p:'status.nameIntervalSec', lk:'lbl_nameInterval', t:'number'},
      {p:'status.showPassword', lk:'lbl_showPassword', t:'bool'}
    ]},
    { title:'Backup', fields:[
      {p:'backup.dir', l:'Backup Dir'},
      {p:'backup.keep', lk:'lbl_backupKeep', t:'number'}
    ]},
    { title:'Supervisor', fields:[
      {p:'autoRestart', lk:'lbl_autoRestart', t:'bool'},
      {p:'dailyRestartTime', lk:'lbl_dailyRestart'}
    ]},
    { title:'Web / Misc', fields:[
      {p:'web.host', l:'Web host'},
      {p:'web.port', l:'Web port', t:'number'},
      {p:'web.token', l:'Web token', secret:true, flag:'web.hasToken'},
      {p:'logBufferSize', l:'Log buffer size', t:'number'}
    ]}
  ];
  function fieldLabel(f){ return f.lk ? t(f.lk) : f.l; }

  /** basic fields → step 2 (friendly); ที่เหลือ → Advanced (จัดกลุ่มตาม section) */
  function renderSetup(){
    var basic = '', adv = '';
    for(var i=0;i<SETUP.length;i++){
      var sec = SETUP[i], advRows = '';
      for(var j=0;j<sec.fields.length;j++){
        var f = sec.fields[j];
        var type = f.secret ? 'password' : (f.t === 'number' ? 'number' : 'text');
        if(f.grp === 'basic'){
          var help = f.help ? t(f.help) : '';
          var link = f.link ? ' <a href="'+f.link+'" target="_blank" rel="noopener" class="text-sky-400 hover:underline">'+h(t('open_link'))+'</a>' : '';
          basic += '<div class="mb-4"><label class="block text-sm text-slate-200 mb-1">'+h(fieldLabel(f))+'</label>'
            + '<input id="'+f.p+'" class="finput" type="'+type+'">'
            + (help ? '<div class="muted mt-1">'+h(help)+link+'</div>' : '') + '</div>';
        } else if(f.t === 'bool'){
          advRows += '<div class="row"><label>'+h(fieldLabel(f))+'</label><select id="'+f.p+'"><option value="true">true</option><option value="false">false</option></select></div>';
        } else {
          advRows += '<div class="row"><label>'+h(fieldLabel(f))+'</label><input id="'+f.p+'" type="'+type+'"></div>';
        }
      }
      if(advRows) adv += '<h3>'+h(sec.title)+'</h3>'+advRows;
    }
    var b = el('setup-basic'); if(b) b.innerHTML = basic;
    var a = el('setup-adv'); if(a) a.innerHTML = adv;
  }

  async function loadSetup(){
    var d = await api('/api/setup');
    if((d.language === 'en' || d.language === 'th') && d.language !== LANG){
      LANG = d.language; localStorage.setItem('dstLang', LANG); applyLang(); renderSetup();
    }
    for(var i=0;i<SETUP.length;i++){
      for(var j=0;j<SETUP[i].fields.length;j++){
        var f = SETUP[i].fields[j];
        var inp = el(f.p);
        if(!inp) continue;
        if(f.secret){
          inp.value = '';
          inp.placeholder = getByPath(d, f.flag) ? t('secret_set_ph') : t('secret_unset_ph');
        } else {
          var v = getByPath(d, f.p);
          inp.value = (v==null) ? '' : String(v);
        }
      }
    }
  }

  async function saveSetup(){
    var body = {};
    for(var i=0;i<SETUP.length;i++){
      for(var j=0;j<SETUP[i].fields.length;j++){
        var f = SETUP[i].fields[j];
        var inp = el(f.p);
        if(!inp) continue;
        if(f.secret && inp.value === '') continue;
        setByPath(body, f.p, inp.value);
      }
    }
    try{
      var r = await api('/api/setup','POST',body);
      var note = r.note + (r.missing.length ? ' · '+t('still_missing')+r.missing.join(', ') : ' '+t('complete'));
      ['setupnote','setupnote-adv'].forEach(function(id){ var e=el(id); if(e) e.textContent = note; });
      toast(t('saved_config')); loadState(); loadToken();
    } catch(e){ toast('✗ '+e.message); }
  }

  async function loadState(){
    try{
      var d = await api('/api/bot/state');
      BOT_STATE = d.state; LAST_MISSING = d.missing || [];
      var badge = el('botstate');
      if(badge){ badge.textContent = d.state; badge.className = 'badge b-' + d.state; }
      var running = d.state === 'running';
      var busy = d.state === 'starting' || d.state === 'stopping';
      if(el('btn-run')) el('btn-run').disabled = running || busy || LAST_MISSING.length>0;
      if(el('btn-stop')) el('btn-stop').disabled = (d.state==='stopped') || busy;
      if(el('btn-rebot')) el('btn-rebot').disabled = busy || LAST_MISSING.length>0;
      if(el('missing')) el('missing').textContent = LAST_MISSING.length ? (t('still_incomplete') + LAST_MISSING.join(', ')) : '';
      var ib = el('btn-import'); if(ib) ib.disabled = (d.state!=='stopped') || impPolling;
      var ist = el('importstate'); if(ist) ist.textContent = (d.state!=='stopped') ? t('import_need_stop') : '';
      var mb = el('btn-mods-setup'); if(mb) mb.disabled = (d.state!=='stopped') || modPolling;
      var mss = el('modsetupstate'); if(mss) mss.textContent = (d.state!=='stopped') ? t('mods_need_stop') : '';
      if(d.error) showError(d.error); else clearError();
      // one-click start: บอทขึ้น running แล้วเริ่มเกมต่อให้อัตโนมัติ (best-effort ครั้งเดียว)
      if(startIntent && running){ startIntent = false; ctrlDst('start'); }
      renderHome(); renderWizard();
    }catch(e){
      if(e && e.message !== 'unauthorized') showError(t('disconnected'));
    }
  }

  async function loadStatus(){
    try{
      var d = await api('/api/status');
      LAST_STATUS = d;
      if(!d.running){ if(el('shards')) el('shards').textContent = t('bot_not_running'); if(el('worldinfo')) el('worldinfo').textContent=''; if(el('players')) el('players').textContent=''; }
      else {
        var icon = { running:'🟢', starting:'🟡', stopping:'🟠', stopped:'🔴' };
        var html = '<table><tr><th>Shard</th><th>State</th><th>PID</th></tr>';
        for(var i=0;i<d.shards.length;i++){ var s=d.shards[i]; html += '<tr><td>'+(icon[s.state]||'⚪')+' '+h(s.shard)+'</td><td>'+h(s.state)+'</td><td>'+(s.pid==null?'-':s.pid)+'</td></tr>'; }
        html += '</table>';
        if(el('shards')) el('shards').innerHTML = html;
        if(el('worldinfo')) el('worldinfo').textContent = d.anyRunning ? ('🗓️ '+t('day_prefix')+' '+(d.world&&d.world.day!=null?d.world.day:'?')+' · '+(d.world&&d.world.season?d.world.season:'?')) : t('offline');
        if(el('players')) el('players').textContent = '👥 ' + (d.players.length? d.players.join(', ') : '—');
      }
      renderHome();
    }catch(e){}
  }

  // ── Home (state-driven) ──
  var homeStage = '';
  function renderHome(){
    var statusEl = el('home-status'); if(!statusEl) return;
    var s = LAST_STATUS, missing = LAST_MISSING || [];
    var stage;
    if(missing.length>0) stage='setup';
    else if(BOT_STATE==='starting') stage='starting';
    else if(BOT_STATE==='stopping') stage='stopping';
    else if(BOT_STATE!=='running') stage='off';
    else if(s && s.anyRunning) stage='online';
    else stage='onidle';

    var dotCls='bg-slate-500', label=t('home_off');
    if(stage==='setup'){ dotCls='bg-amber-500'; label=t('home_needsetup'); }
    else if(stage==='starting'){ dotCls='bg-amber-400 animate-pulse'; label=t('home_starting'); }
    else if(stage==='stopping'){ dotCls='bg-amber-400 animate-pulse'; label=t('home_stopping'); }
    else if(stage==='onidle'){ dotCls='bg-amber-500'; label=t('home_onidle'); }
    else if(stage==='online'){ dotCls='bg-emerald-500'; label=t('home_online'); }
    el('home-dot').className = 'inline-block w-3.5 h-3.5 rounded-full '+dotCls;
    statusEl.textContent = label;

    var sub = el('home-sub'), pl = el('home-players');
    if(stage==='online' && s){
      var parts = ['👥 '+s.players.length+' '+t('home_players_word')];
      if(s.world && s.world.day!=null) parts.push('🗓️ '+t('day_prefix')+' '+s.world.day);
      if(s.world && s.world.season) parts.push(s.world.season);
      sub.textContent = parts.join('  ·  ');
      pl.textContent = s.players.length ? ('👥 '+s.players.join(', ')) : '';
    } else { sub.textContent = t('home_sub_'+stage) || ''; pl.textContent = ''; }

    el('home-quick').classList.toggle('hidden', stage!=='online');
    el('home-hint').textContent = (stage==='setup') ? (t('still_incomplete')+missing.join(', ')) : '';

    if(stage !== homeStage){
      homeStage = stage;
      var html = '';
      if(stage==='setup') html = '<button class="big" data-home="gosetup">'+h(t('home_go_setup'))+'</button>';
      else if(stage==='off') html = '<button class="big ok" data-home="start">'+h(t('home_start'))+'</button>';
      else if(stage==='onidle') html = '<button class="big ok" data-home="startgame">'+h(t('home_start_game'))+'</button> <button class="ghost" data-home="poweroff">'+h(t('home_poweroff'))+'</button>';
      else if(stage==='online') html = '<button class="big danger" data-home="stop">'+h(t('home_stop'))+'</button> <button data-home="restart">'+h(t('home_restart'))+'</button>';
      el('home-primary').innerHTML = html;
    }
  }

  function startServer(){
    if((LAST_MISSING||[]).length>0){ showTab('setup'); return; }
    startIntent = true;
    botLifecycle('start');
  }

  // ── Setup wizard step status ──
  function setStep(id, ok, okText, notText){
    var e = el(id); if(!e) return;
    e.innerHTML = ok ? '<span class="text-emerald-400">✓ '+h(okText)+'</span>' : '<span class="warn">'+h(notText)+'</span>';
  }
  function renderWizard(){
    setStep('step1-status', LAST_SERVER.installed, t('w_installed'), t('w_not_installed'));
    setStep('step2-status', (LAST_MISSING||[]).length===0, t('w_discord_ok'), t('w_discord_no'));
    setStep('step3-status', LAST_TOKEN.has, t('w_token_ok'), t('w_token_no'));
    setStep('step4-status', BOT_STATE==='running', t('w_running'), t('w_not_running'));
  }

  async function loadMods(){
    try{
      var d = await api('/api/mods');
      if(!d.available){ el('mods').textContent = d.mods ? t('mods_none_file') : t('bot_not_running'); return; }
      if(!d.mods.length){ el('mods').textContent = t('mods_none_enabled'); return; }
      var on = d.mods.filter(function(m){ return m.enabled; }).length;
      var html = '<div class="muted mb-1">'+on+'/'+d.mods.length+' '+t('enabled_suffix')+'</div><ul class="list-none p-0 m-0">';
      for(var i=0;i<d.mods.length;i++){ var m = d.mods[i]; html += '<li>'+(m.enabled?'🟢':'⚪')+' <a href="'+h(m.url)+'" target="_blank" rel="noopener" class="text-sky-400 hover:underline">'+h(m.name)+'</a></li>'; }
      html += '</ul>';
      el('mods').innerHTML = html;
    }catch(e){ el('mods').innerHTML = '<span class="warn">'+t('mods_read_error')+h(e.message)+'</span>'; }
  }

  async function loadCluster(){
    try{
      var d = await api('/api/config');
      var html = '';
      for(var i=0;i<d.cluster.length;i++){
        var f = d.cluster[i];
        html += '<div class="row"><label title="'+h(f.description)+'">'+h(f.key)+'</label>';
        if(f.type==='enum'&&f.values){
          html += '<select id="cl-'+h(f.key)+'">';
          for(var j=0;j<f.values.length;j++){ var v=f.values[j]; html += '<option'+(v===f.value?' selected':'')+'>'+h(v)+'</option>'; }
          html += '</select>';
        } else if(f.type==='bool'){
          html += '<select id="cl-'+h(f.key)+'"><option'+(f.value==='true'?' selected':'')+'>true</option><option'+(f.value==='false'?' selected':'')+'>false</option></select>';
        } else {
          html += '<input id="cl-'+h(f.key)+'" type="'+(f.sensitive?'password':'text')+'" value="'+h(f.value)+'"'+(f.sensitive?' placeholder="'+h(t('cluster_sensitive_ph'))+'"':'')+'>';
        }
        html += '<button class="clsave" data-key="'+h(f.key)+'">'+h(t('save'))+'</button></div>';
      }
      el('cluster').innerHTML = html;
    }catch(e){ el('cluster').innerHTML = '<span class="warn">'+t('cluster_read_error')+h(e.message)+'</span>'; }
  }

  async function saveCluster(key){
    var inp = el('cl-'+key); if(!inp) return;
    try{ var r = await api('/api/config','POST',{key:key,value:inp.value}); toast('✓ '+r.key+' = '+r.value+' ('+r.note+')'); }
    catch(e){ toast('✗ '+e.message); }
  }

  function fillShardSelect(sel, shards, keep){
    if(!sel || !shards) return;
    var cur = keep || sel.value;
    sel.innerHTML = '';
    for(var i=0;i<shards.length;i++){ var o=document.createElement('option'); o.value=shards[i]; o.textContent=shards[i]; sel.appendChild(o); }
    if(cur && shards.indexOf(cur)>=0) sel.value = cur;
  }

  // ── modoverrides.lua editor ──
  async function loadModoverrides(){
    try{
      var sel = el('mo-shard');
      var shard = sel.value;
      var d = await api('/api/modoverrides' + (shard?('?shard='+encodeURIComponent(shard)):''));
      if(sel.options.length===0) fillShardSelect(sel, d.shards, d.shard);
      el('mo-content').value = d.content || '';
      el('mo-state').textContent = '';
    }catch(e){ el('mo-state').innerHTML = '<span class="warn">'+t('mo_load_err')+h(e.message)+'</span>'; }
  }
  async function saveModoverrides(){
    try{ var r = await api('/api/modoverrides','POST',{shard:el('mo-shard').value, content:el('mo-content').value}); toast(t('mo_saved')+' ('+r.note+')'); }
    catch(e){ toast('✗ '+e.message); }
  }

  // ── world settings (worldgenoverride.lua) ──
  async function loadWorldGen(){
    try{
      var sel = el('wg-shard'); var shard = sel.value;
      var d = await api('/api/worldgen' + (shard?('?shard='+encodeURIComponent(shard)):''));
      if(sel.options.length===0) fillShardSelect(sel, d.shards, d.shard);
      el('wg-enabled').checked = !!d.overrideEnabled;
      var cur = d.values || {};
      var html = '';
      for(var g=0; g<d.schema.length; g++){ var grp=d.schema[g];
        html += '<h3>'+h(grp.group)+'</h3>';
        for(var i=0;i<grp.options.length;i++){ var o=grp.options[i];
          var selv = (o.name in cur) ? String(cur[o.name]) : 'default';
          html += '<div class="row"><label title="'+h(o.name)+'">'+h(o.label)+'</label><select class="wgopt" data-name="'+h(o.name)+'">';
          for(var j=0;j<o.options.length;j++){ var c=o.options[j]; var v=String(c.data);
            html += '<option value="'+h(v)+'"'+(selv===v?' selected':'')+'>'+h(c.description)+'</option>';
          }
          html += '</select></div>';
        }
      }
      el('wg-form').innerHTML = html;
    }catch(e){ el('wg-form').innerHTML = '<span class="warn">✗ '+h(e.message)+'</span>'; }
  }
  async function saveWorldGen(){
    var values = {};
    document.querySelectorAll('#wg-form .wgopt').forEach(function(s){ values[s.getAttribute('data-name')] = s.value; });
    try{ var r = await api('/api/worldgen','POST',{shard:el('wg-shard').value, values:values, overrideEnabled:el('wg-enabled').checked}); toast(t('wg_saved')+' ('+r.note+')'); }
    catch(e){ toast('✗ '+e.message); }
  }

  // ── live server log (poll) — shard "all" = ทุก shard รวมกัน (ดีฟอลต์) ──
  async function loadServerLog(){
    try{
      var sel = el('log-shard');
      var shard = sel.value || 'all';
      var d = await api('/api/logs?lines=300&shard='+encodeURIComponent(shard));
      if(sel.options.length===0){
        var all = document.createElement('option'); all.value='all'; all.textContent=t('log_all'); all.setAttribute('data-i18n','log_all'); sel.appendChild(all);
        if(d.shards) for(var i=0;i<d.shards.length;i++){ var o=document.createElement('option'); o.value=d.shards[i]; o.textContent=d.shards[i]; sel.appendChild(o); }
        sel.value = 'all';
      }
      var pre = el('serverlog');
      if(!d.running){ pre.textContent = t('log_not_running'); return; }
      pre.textContent = (d.lines && d.lines.length) ? d.lines.join('\\n') : '—';
      if(el('log-follow').checked) pre.scrollTop = pre.scrollHeight;
    }catch(e){}
  }

  // ── admins (adminlist.txt) ──
  async function loadAdmins(){
    try{
      var d = await api('/api/admins');
      var html;
      if(!d.admins.length) html = '<span class="muted">'+h(t('admin_none'))+'</span>';
      else {
        html = '<ul class="list-none p-0 m-0">';
        for(var i=0;i<d.admins.length;i++){ var id=d.admins[i];
          html += '<li class="flex items-center gap-2 mb-1"><code class="text-slate-200 text-xs">'+h(id)+'</code><button class="admrm ghost !px-2 !py-0.5 text-xs" data-id="'+h(id)+'">✕</button></li>';
        }
        html += '</ul>';
      }
      el('adminlist').innerHTML = html;
      var sel = el('admin-player'); sel.innerHTML='';
      if(d.players && d.players.length){
        for(var j=0;j<d.players.length;j++){ var p=d.players[j]; var o=document.createElement('option'); o.value=p.userid; o.textContent=p.name+' ('+p.userid+')'; sel.appendChild(o); }
        el('btn-admin-add-player').disabled=false;
      } else {
        var o2=document.createElement('option'); o2.value=''; o2.textContent=t(d.running?'admin_no_players':'admin_need_running'); sel.appendChild(o2);
        el('btn-admin-add-player').disabled=true;
      }
    }catch(e){ el('adminlist').innerHTML = '<span class="warn">✗ '+h(e.message)+'</span>'; }
  }
  async function doAddAdmin(id){
    if(!id) return;
    try{ var r = await api('/api/admins','POST',{action:'add', id:id}); toast(t('admin_added')+' ('+r.note+')'); loadAdmins(); }
    catch(e){ toast('✗ '+e.message); }
  }
  async function doRemoveAdmin(id){
    try{ var r = await api('/api/admins','POST',{action:'remove', id:id}); toast(t('admin_removed')+' ('+r.note+')'); loadAdmins(); }
    catch(e){ toast('✗ '+e.message); }
  }

  // ── mods manager (friendly) ──
  async function loadModsManager(){
    try{
      var sel = el('mm-shard'); var shard = sel.value;
      var d = await api('/api/mods/manage' + (shard?('?shard='+encodeURIComponent(shard)):''));
      if(sel.options.length===0) fillShardSelect(sel, d.shards, d.shard);
      var html;
      if(!d.mods.length) html = '<span class="muted">'+h(t('mm_none'))+'</span>';
      else {
        html = '<ul class="list-none p-0 m-0">';
        for(var i=0;i<d.mods.length;i++){ var m=d.mods[i];
          html += '<li class="flex items-center gap-2 mb-1.5">'
            + '<button class="mmtoggle ghost !px-2 !py-0.5 text-xs" data-id="'+h(m.id)+'" data-en="'+(m.enabled?'1':'0')+'" title="'+(m.enabled?'on':'off')+'">'+(m.enabled?'🟢':'⚪')+'</button>'
            + '<a href="'+h(m.url)+'" target="_blank" rel="noopener" class="text-sky-400 hover:underline flex-1 truncate">'+h(m.name)+'</a>'
            + (m.hasConfig ? '<button class="mmcfg ghost !px-2 !py-0.5 text-xs" data-id="'+h(m.id)+'" title="config">⚙️</button>' : '')
            + '<button class="mmrm ghost !px-2 !py-0.5 text-xs" data-id="'+h(m.id)+'" title="remove">✕</button>'
            + '</li>';
        }
        html += '</ul>';
      }
      el('mm-list').innerHTML = html;
    }catch(e){ el('mm-list').innerHTML = '<span class="warn">✗ '+h(e.message)+'</span>'; }
  }
  async function mmAction(action, id, enabled){
    try{ var r = await api('/api/mods/manage','POST',{shard:el('mm-shard').value, action:action, id:id, enabled:enabled}); toast('✓ ('+r.note+')'); loadModsManager(); loadMods(); }
    catch(e){ toast('✗ '+e.message); }
  }
  async function mmShowConfig(id){
    var box = el('mm-config');
    try{
      var d = await api('/api/mods/config?id='+encodeURIComponent(id)+'&shard='+encodeURIComponent(el('mm-shard').value));
      if(!d.schema.length){ box.innerHTML = '<span class="warn">'+h(t('mm_no_config'))+'</span>'; box.classList.remove('hidden'); return; }
      var cur = d.values || {};
      var html = '<div class="text-sm font-semibold text-slate-200 mb-2">⚙️ '+h(t('mm_config_for'))+' '+h(id)+'</div>';
      for(var i=0;i<d.schema.length;i++){ var o=d.schema[i];
        var selv = (o.name in cur) ? cur[o.name] : o.default;
        html += '<div class="row"><label title="'+h(o.name)+'">'+h(o.label)+'</label><select class="mmopt" data-name="'+h(o.name)+'">';
        for(var j=0;j<o.options.length;j++){ var c=o.options[j]; var v=JSON.stringify(c.data);
          html += '<option value="'+h(v)+'"'+(JSON.stringify(selv)===v?' selected':'')+'>'+h(c.description)+'</option>';
        }
        html += '</select></div>';
      }
      html += '<div class="controls mt-2"><button class="clsave" id="btn-mm-cfg-save" data-id="'+h(id)+'">'+h(t('save'))+'</button><button class="ghost" id="btn-mm-cfg-close">'+h(t('cancel'))+'</button></div>';
      box.innerHTML = html; box.classList.remove('hidden');
    }catch(e){ box.innerHTML = '<span class="warn">✗ '+h(e.message)+'</span>'; box.classList.remove('hidden'); }
  }
  async function mmSaveConfig(id){
    var values = {};
    document.querySelectorAll('#mm-config .mmopt').forEach(function(s){ try{ values[s.getAttribute('data-name')] = JSON.parse(s.value); }catch(e){} });
    try{ var r = await api('/api/mods/config','POST',{shard:el('mm-shard').value, id:id, values:values}); toast(t('mm_config_saved')+' ('+r.note+')'); el('mm-config').classList.add('hidden'); }
    catch(e){ toast('✗ '+e.message); }
  }

  async function loadToken(){
    try{
      var d = await api('/api/token');
      LAST_TOKEN.has = !!d.hasToken;
      el('cltoken').value = d.token || '';
      if(!d.cluster) el('tokenstate').innerHTML = '<span class="warn">'+h(t('token_no_cluster'))+'</span>';
      else if(d.hasToken) el('tokenstate').innerHTML = '<span class="text-emerald-400">'+h(t('token_present'))+'</span>';
      else el('tokenstate').innerHTML = '<span class="warn">'+h(t('token_missing'))+'</span>';
      renderWizard();
    }catch(e){ el('tokenstate').innerHTML = '<span class="warn">✗ '+h(e.message)+'</span>'; }
  }

  async function saveToken(){
    try{ var r = await api('/api/token','POST',{token:el('cltoken').value}); toast('✓ '+r.note); loadToken(); loadState(); }
    catch(e){ toast('✗ '+e.message); }
  }

  // ── import ──
  function syncImportUI(){
    if(!el('imp-kind')) return;
    var kind = el('imp-kind').value;
    el('imp-file-row').classList.toggle('hidden', kind!=='archive');
    el('imp-path-row').classList.toggle('hidden', kind!=='folder');
    el('imp-warn').classList.toggle('hidden', el('imp-mode').value!=='full');
  }
  function renderImportProgress(d){
    var wrap=el('impbar-wrap'),bar=el('impbar'),pct=el('impbar-pct');
    if(!wrap) return;
    var phase=d.phase?(d.phase+' '):'';
    if(d.running){
      wrap.classList.remove('hidden'); bar.classList.remove('bg-rose-500');
      if(d.progress==null){ bar.classList.add('animate-pulse'); bar.style.width='100%'; pct.textContent=phase+'…'; }
      else { bar.classList.remove('animate-pulse'); bar.style.width=d.progress.toFixed(0)+'%'; pct.textContent=phase+d.progress.toFixed(1)+'%'; }
    } else if(d.error){ wrap.classList.remove('hidden'); bar.classList.remove('animate-pulse'); bar.classList.add('bg-rose-500'); pct.textContent='✗'; }
    else if(d.done){ wrap.classList.remove('hidden'); bar.classList.remove('animate-pulse','bg-rose-500'); bar.style.width='100%'; pct.textContent='100%'; }
    if(d.log && d.log.length){ var pre=el('implog'); pre.classList.remove('hidden'); pre.textContent=d.log.join('\\n'); pre.scrollTop=pre.scrollHeight; }
  }
  async function pollImport(){
    if(impPolling) return;
    impPolling=true;
    var tick=async function(){
      var d; try{ d=await api('/api/import/status'); }catch(e){ d=null; }
      if(d){
        renderImportProgress(d);
        if(d.running){ setTimeout(tick,1000); return; }
        if(d.error) toast(t('imp_failed')+d.error); else if(d.done) toast(t('imp_done'));
      }
      impPolling=false;
      loadState(); loadStatus(); loadCluster(); loadMods();
    };
    tick();
  }
  async function uploadArchive(file){
    var res=await fetch('/api/import/upload',{method:'POST',headers:{'x-dst-token':getToken(),'x-import-filename':file.name},body:file});
    if(res.status===401){ localStorage.removeItem(TKEY); alert(t('token_wrong')); location.reload(); throw new Error('unauthorized'); }
    var d=await res.json(); if(!res.ok) throw new Error(d.error||('HTTP '+res.status)); return d.uploadId;
  }
  async function doImport(){
    if(BOT_STATE!=='stopped'){ toast(t('imp_must_stop')); return; }
    var kind=el('imp-kind').value, mode=el('imp-mode').value, regenerate=el('imp-regen').checked;
    if(!confirm(t('imp_confirm'))) return;
    el('btn-import').disabled=true;
    try{
      var body={kind:kind, mode:mode, regenerate:regenerate};
      if(kind==='archive'){
        var f=el('imp-file').files[0];
        if(!f){ toast(t('imp_no_file')); el('btn-import').disabled=false; return; }
        toast(t('imp_uploading'));
        body.uploadId=await uploadArchive(f);
      } else { body.path=el('imp-path').value; }
      toast(t('imp_importing'));
      await api('/api/import','POST',body);
      pollImport();
    }catch(e){ toast('✗ '+e.message); el('btn-import').disabled=false; loadState(); }
  }

  // ── mods provisioning ──
  function renderModProgress(d){
    var wrap=el('modbar-wrap'),bar=el('modbar'),pct=el('modbar-pct');
    if(!wrap) return;
    var phase=d.phase?(d.phase+' '):'';
    if(d.running){
      wrap.classList.remove('hidden'); bar.classList.remove('bg-rose-500');
      if(d.progress==null){ bar.classList.add('animate-pulse'); bar.style.width='100%'; pct.textContent=phase+'…'; }
      else { bar.classList.remove('animate-pulse'); bar.style.width=d.progress.toFixed(0)+'%'; pct.textContent=phase+d.progress.toFixed(1)+'%'; }
    } else if(d.error){ wrap.classList.remove('hidden'); bar.classList.remove('animate-pulse'); bar.classList.add('bg-rose-500'); pct.textContent='✗'; }
    else if(d.done){ wrap.classList.remove('hidden'); bar.classList.remove('animate-pulse','bg-rose-500'); bar.style.width='100%'; pct.textContent='100%'; }
    if(d.log && d.log.length){ var pre=el('modlog'); pre.classList.remove('hidden'); pre.textContent=d.log.join('\\n'); pre.scrollTop=pre.scrollHeight; }
  }
  async function pollMods(){
    if(modPolling) return;
    modPolling=true;
    var tick=async function(){
      var d; try{ d=await api('/api/mods/provision/status'); }catch(e){ d=null; }
      if(d){
        renderModProgress(d);
        if(d.running){ setTimeout(tick,1000); return; }
        if(d.error) toast(t('mods_failed')+d.error); else if(d.done) toast(t('mods_done'));
      }
      modPolling=false;
      loadState(); loadMods();
    };
    tick();
  }
  async function doProvisionMods(){
    if(BOT_STATE!=='stopped'){ toast(t('mods_need_stop')); return; }
    if(!confirm(t('mods_confirm'))) return;
    el('btn-mods-setup').disabled=true;
    try{ toast(t('mods_provisioning')); await api('/api/mods/provision','POST'); pollMods(); }
    catch(e){ toast('✗ '+e.message); loadState(); }
  }

  // ── DST control + bot lifecycle ──
  async function ctrlDst(action){
    if((action==='stop'||action==='restart')&&!confirm(t('confirm_action')+action+' ?')) return;
    toast('⏳ '+action+'...');
    try{ var r = await api('/api/control','POST',{action:action}); toast((r.ok?'✓ ':'⚠️ ')+(r.message||r.error)); loadStatus(); }
    catch(e){ toast('✗ '+e.message); }
  }
  async function botLifecycle(path){
    toast('⏳ ...');
    try{ await api('/api/bot/'+path,'POST'); }
    catch(e){ toast('✗ '+e.message); }
    loadState(); loadStatus();
    if(path==='start'||path==='restart') setTimeout(function(){ loadCluster(); loadMods(); }, 500);
  }

  async function changeLang(lang){
    if(lang !== 'en' && lang !== 'th') return;
    LANG = lang;
    localStorage.setItem('dstLang', LANG);
    applyLang();
    renderSetup(); loadSetup();
    syncImportUI();
    homeStage = ''; renderHome(); renderWizard();
    loadState(); loadStatus(); loadMods(); loadCluster(); loadServerStatus(); loadToken(); loadServerLog(); loadAdmins(); loadModsManager(); loadWorldGen();
    try{ await api('/api/lang','POST',{language:LANG}); }catch(e){}
  }

  // ── DST server install ──
  function renderServer(d){
    LAST_SERVER.installed = !!d.installed;
    el('srvstate').innerHTML = d.installed
      ? '<span class="text-emerald-400">'+h(t('installed'))+'</span>'
      : '<span class="warn">'+h(t('not_installed'))+'</span>';
    el('srvnote').textContent = d.installDir ? ('📁 '+d.installDir) : '';
    el('btn-install').disabled = d.running || BOT_STATE !== 'stopped';
    renderProgress(d);
    renderWizard();
    if(d.log && d.log.length){ var pre = el('srvlog'); pre.classList.remove('hidden'); pre.textContent = d.log.join('\\n'); pre.scrollTop = pre.scrollHeight; }
  }
  function renderProgress(d){
    var wrap = el('srvbar-wrap'), bar = el('srvbar'), pct = el('srvbar-pct');
    if(!wrap) return;
    var phase = d.phase ? (d.phase + ' ') : '';
    if(d.running){
      wrap.classList.remove('hidden'); bar.classList.remove('bg-rose-500');
      if(d.progress == null){ bar.classList.add('animate-pulse'); bar.style.width = '100%'; pct.textContent = phase + '…'; }
      else { bar.classList.remove('animate-pulse'); bar.style.width = d.progress.toFixed(0) + '%'; pct.textContent = phase + d.progress.toFixed(1) + '%'; }
    } else if(d.error){ wrap.classList.remove('hidden'); bar.classList.remove('animate-pulse'); bar.classList.add('bg-rose-500'); pct.textContent = '✗'; }
    else if(d.done){ wrap.classList.remove('hidden'); bar.classList.remove('animate-pulse','bg-rose-500'); bar.style.width = '100%'; pct.textContent = '100%'; }
    else { wrap.classList.add('hidden'); }
  }
  async function loadServerStatus(){ try{ renderServer(await api('/api/server/status')); }catch(e){} }
  async function pollServer(){
    if(srvPolling) return;
    srvPolling = true;
    var tick = async function(){
      var d; try{ d = await api('/api/server/status'); }catch(e){ d = null; }
      if(d){
        renderServer(d);
        if(d.running){ setTimeout(tick, 1500); return; }
        if(d.error) toast(t('install_failed')+d.error); else if(d.done) toast(t('install_done'));
      }
      srvPolling = false; loadState();
    };
    tick();
  }
  async function doInstall(){
    if(BOT_STATE !== 'stopped'){ toast(t('must_stop_to_install')); return; }
    if(!confirm(t('confirm_install'))) return;
    el('btn-install').disabled = true;
    el('srvlog').classList.remove('hidden');
    el('srvlog').textContent = t('installing');
    try{ await api('/api/server/install','POST'); pollServer(); }
    catch(e){ toast('✗ '+e.message); loadServerStatus(); }
  }

  // ── wiring ──
  el('btn-install').addEventListener('click', doInstall);
  el('btn-run').addEventListener('click', function(){ botLifecycle('start'); });
  el('btn-stop').addEventListener('click', function(){ botLifecycle('stop'); });
  el('btn-rebot').addEventListener('click', function(){ botLifecycle('restart'); });
  el('btn-save').addEventListener('click', saveSetup);
  el('btn-save-adv').addEventListener('click', saveSetup);
  el('btn-token-save').addEventListener('click', saveToken);
  el('btn-import').addEventListener('click', doImport);
  el('btn-mods-setup').addEventListener('click', doProvisionMods);
  el('btn-mo-save').addEventListener('click', saveModoverrides);
  el('mo-shard').addEventListener('change', loadModoverrides);
  el('btn-wg-save').addEventListener('click', saveWorldGen);
  el('wg-shard').addEventListener('change', loadWorldGen);
  el('log-shard').addEventListener('change', loadServerLog);
  el('btn-admin-add-player').addEventListener('click', function(){ doAddAdmin(el('admin-player').value); });
  el('btn-admin-add-id').addEventListener('click', function(){ var v=el('admin-id').value.trim(); if(v){ doAddAdmin(v); el('admin-id').value=''; } });
  el('mm-shard').addEventListener('change', function(){ el('mm-config').classList.add('hidden'); loadModsManager(); });
  el('btn-mm-add').addEventListener('click', function(){ var v=el('mm-add-id').value.trim(); if(/^\d+$/.test(v)){ mmAction('add', v); el('mm-add-id').value=''; } else toast('✗ '+t('admin_add')); });
  el('btn-gohome').addEventListener('click', function(){ showTab('home'); startServer(); });
  el('imp-kind').addEventListener('change', syncImportUI);
  el('imp-mode').addEventListener('change', syncImportUI);
  el('home-save').addEventListener('click', function(){ ctrlDst('save'); });
  el('home-backup').addEventListener('click', function(){ ctrlDst('backup'); });
  el('home-primary').addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('[data-home]') : null; if(!b) return;
    var a = b.getAttribute('data-home');
    if(a==='gosetup') showTab('setup');
    else if(a==='start') startServer();
    else if(a==='startgame') ctrlDst('start');
    else if(a==='stop') ctrlDst('stop');
    else if(a==='restart') ctrlDst('restart');
    else if(a==='poweroff') botLifecycle('stop');
  });
  el('errclose').addEventListener('click', clearError);
  el('lang').addEventListener('change', function(e){ changeLang(e.target.value); });
  el('tabs').addEventListener('click', function(e){ var b = e.target.closest ? e.target.closest('.tab') : null; if(b) showTab(b.getAttribute('data-tab')); });

  window.addEventListener('error', function(e){ toast('✗ ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function(e){
    var m = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
    if(m !== 'unauthorized') toast('✗ ' + m);
  });
  document.addEventListener('click', function(e){
    var tg = e.target;
    if(tg.classList && tg.classList.contains('clsave') && tg.dataset.key) saveCluster(tg.dataset.key);
    var ab = tg.closest ? tg.closest('.admrm') : null; if(ab) doRemoveAdmin(ab.getAttribute('data-id'));
    if(!tg.closest) return;
    var mt = tg.closest('.mmtoggle'); if(mt) mmAction('toggle', mt.getAttribute('data-id'), mt.getAttribute('data-en')!=='1');
    var mc = tg.closest('.mmcfg'); if(mc) mmShowConfig(mc.getAttribute('data-id'));
    var mr = tg.closest('.mmrm'); if(mr && confirm(t('mm_remove_confirm'))) mmAction('remove', mr.getAttribute('data-id'));
    if(tg.id==='btn-mm-cfg-save') mmSaveConfig(tg.getAttribute('data-id'));
    if(tg.id==='btn-mm-cfg-close') el('mm-config').classList.add('hidden');
  });

  applyLang();
  showTab(TAB);
  renderHome();
  renderWizard();
  getToken();
  renderSetup();
  loadSetup();
  loadState();
  loadStatus();
  loadCluster();
  loadMods();
  loadServerStatus();
  loadToken();
  loadModoverrides();
  loadServerLog();
  syncImportUI();
  setInterval(loadState, 4000);
  setInterval(loadStatus, 6000);
  setInterval(function(){ if(!srvPolling) loadServerStatus(); }, 5000);
  setInterval(function(){ if(TAB==='home') loadServerLog(); }, 1500);
</script>
</body>
</html>`;
