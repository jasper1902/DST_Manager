/** หน้า web UI: setup config + ปุ่มรันบอท + dashboard (เสิร์ฟโดย web/server.ts)
 *  i18n ฝั่ง client: ดีฟอลต์อังกฤษ, สลับไทยได้จาก selector มุมขวาบน (เก็บค่าใน config.json) */
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
    button { @apply inline-flex items-center gap-1.5 bg-indigo-600 text-white border-0 rounded-lg px-3.5 py-2 cursor-pointer text-[13px] font-medium transition-all hover:bg-indigo-500 active:scale-[.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 disabled:active:scale-100; }
    button.danger { @apply bg-rose-600 hover:bg-rose-500 disabled:hover:bg-rose-600; }
    button.ghost { @apply bg-slate-700 hover:bg-slate-600 disabled:hover:bg-slate-700; }
    button.ok { @apply bg-emerald-600 hover:bg-emerald-500 disabled:hover:bg-emerald-600; }
    .clsave { @apply bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs flex-none; }
    .controls { @apply flex gap-2 flex-wrap items-center; }
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
  }
</style>
</head>
<body class="font-sans">
<header class="sticky top-0 z-20 backdrop-blur-md bg-slate-950/60 border-b border-slate-800/80 px-6 py-4 flex items-center gap-2.5 text-lg font-semibold">
  <span class="text-2xl">🌳</span>
  <span class="bg-gradient-to-r from-emerald-300 via-teal-300 to-indigo-300 bg-clip-text text-transparent">DST Manager</span>
  <span class="flex-1"></span>
  <span class="muted hidden sm:inline" data-i18n="lang_label">Language</span>
  <select id="lang" title="Language / ภาษา">
    <option value="en">English</option>
    <option value="th">ไทย</option>
  </select>
</header>
<main class="max-w-3xl mx-auto p-5">
  <div id="errbar" class="hidden items-start gap-3 bg-rose-950/60 border border-rose-500/50 text-rose-200 rounded-xl px-4 py-3 mb-5 text-sm shadow-lg shadow-rose-900/30">
    <span class="text-lg leading-none mt-0.5">⚠️</span>
    <span id="errmsg" class="flex-1 break-words whitespace-pre-wrap"></span>
    <button id="errclose" class="ghost !bg-transparent hover:!bg-rose-500/20 !text-rose-200 !px-2 !py-1 -mt-1 -mr-1">✕</button>
  </div>

  <div class="card">
    <h2><span data-i18n="sec_bot">🤖 Bot</span></h2>
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
    <h2><span data-i18n="sec_config">⚙️ Settings (config.json)</span></h2>
    <div id="setup" class="text-slate-400 text-sm" data-i18n="loading">Loading...</div>
    <div class="controls mt-4">
      <button id="btn-save" data-i18n="btn_save_config">💾 Save config</button>
      <span id="setupnote" class="muted"></span>
    </div>
  </div>

  <div class="card">
    <h2><span data-i18n="sec_server">📥 DST Server</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_server_note">(download/update via SteamCMD)</span></h2>
    <div class="controls">
      <span class="text-sm text-slate-400" data-i18n="status_label">Status:</span> <span id="srvstate" class="text-sm text-slate-300">...</span>
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
    <h2><span data-i18n="sec_status">📊 Server status</span></h2>
    <div id="shards" class="text-slate-400 text-sm">—</div>
    <div id="worldinfo"></div>
    <div id="players"></div>
  </div>

  <div class="card">
    <h2><span data-i18n="sec_mods">🧩 Mods in use</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_mods_note">(from modoverrides.lua)</span></h2>
    <div id="mods" class="text-slate-400 text-sm">—</div>
  </div>

  <div class="card">
    <h2><span data-i18n="sec_control">🎮 Control DST</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_control_note">(start the bot first)</span></h2>
    <div class="controls">
      <button class="ctrl ok" data-action="start">▶️ Start</button>
      <button class="ctrl danger" data-action="stop">⏹️ Stop</button>
      <button class="ctrl" data-action="restart">🔄 Restart</button>
      <button class="ctrl ghost" data-action="save">💾 Save</button>
      <button class="ctrl ghost" data-action="backup">🗄️ Backup</button>
    </div>
  </div>

  <div class="card">
    <h2><span data-i18n="sec_cluster">📝 cluster.ini</span> <span class="muted normal-case tracking-normal font-normal" data-i18n="sec_cluster_note">(takes effect on DST restart)</span></h2>
    <div id="cluster" class="text-slate-400 text-sm">—</div>
  </div>
</main>
<div id="toast"></div>
<script>
  var I18N = {
    en: {
      lang_label: 'Language',
      lang_note: 'Note: the web UI switches language instantly; Discord applies it after the next bot restart.',
      sec_bot: '🤖 Bot', sec_config: '⚙️ Settings (config.json)',
      sec_server: '📥 DST Server', sec_server_note: '(download/update via SteamCMD)',
      sec_status: '📊 Server status', sec_mods: '🧩 Mods in use', sec_mods_note: '(from modoverrides.lua)',
      sec_control: '🎮 Control DST', sec_control_note: '(start the bot first)',
      sec_cluster: '📝 cluster.ini', sec_cluster_note: '(takes effect on DST restart)',
      status_label: 'Status:', btn_run: '▶️ Run bot', btn_stop: '⏹️ Stop', btn_rebot: '🔄 restart',
      btn_save_config: '💾 Save config', btn_install: '⬇️ Download/update DST server',
      loading: 'Loading...', save: 'Save',
      prompt_token: 'Enter the web token (see the console where you ran bun start):',
      token_wrong: 'wrong token — try again', saved_config: 'Config saved',
      still_missing: 'still missing: ', complete: '✓ complete',
      still_incomplete: '⚠️ Not fully configured: ', disconnected: '🔌 Lost connection to DST Manager — the server may be down',
      bot_not_running: "the bot isn't running", offline: 'Offline', day_prefix: 'Day',
      mods_none_file: 'No mods enabled (modoverrides.lua not found)',
      mods_none_enabled: 'Mod file exists but no mods are enabled',
      enabled_suffix: 'enabled', mods_read_error: "Can't read mods: ",
      cluster_read_error: "Can't read cluster.ini (set the cluster name to match the folder + download the server first): ",
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
      lbl_cluster: 'Cluster (folder name under games/DoNotStarveTogether/clusters)',
      lbl_shards: 'Shards (comma, empty=auto)',
      lbl_msgInterval: 'embed interval (sec)', lbl_nameInterval: 'voice name interval (sec)',
      lbl_showPassword: 'Show password in embed', lbl_backupKeep: 'How many files to keep',
      lbl_autoRestart: 'Auto-restart on crash', lbl_dailyRestart: 'Daily restart HH:MM (empty=off)',
    },
    th: {
      lang_label: 'ภาษา',
      lang_note: 'หมายเหตุ: web UI สลับภาษาทันที ส่วน Discord จะเปลี่ยนตอน restart บอทครั้งถัดไป',
      sec_bot: '🤖 บอท', sec_config: '⚙️ ตั้งค่า (config.json)',
      sec_server: '📥 DST Server', sec_server_note: '(ดาวน์โหลด/อัปเดตผ่าน SteamCMD)',
      sec_status: '📊 สถานะ server', sec_mods: '🧩 ม็อดที่ใช้', sec_mods_note: '(จาก modoverrides.lua)',
      sec_control: '🎮 ควบคุม DST', sec_control_note: '(ต้องรันบอทก่อน)',
      sec_cluster: '📝 cluster.ini', sec_cluster_note: '(มีผลตอน restart DST)',
      status_label: 'สถานะ:', btn_run: '▶️ รันบอท', btn_stop: '⏹️ หยุด', btn_rebot: '🔄 restart',
      btn_save_config: '💾 บันทึก config', btn_install: '⬇️ ดาวน์โหลด/อัปเดต DST server',
      loading: 'กำลังโหลด...', save: 'บันทึก',
      prompt_token: 'ใส่ Web token (ดูจาก console ที่รัน bun start):',
      token_wrong: 'token ผิด — ลองใหม่', saved_config: 'บันทึก config แล้ว',
      still_missing: 'ยังขาด: ', complete: '✓ ครบ',
      still_incomplete: '⚠️ ยังกรอกไม่ครบ: ', disconnected: '🔌 ขาดการเชื่อมต่อกับ DST Manager — เซิร์ฟเวอร์อาจถูกปิดอยู่',
      bot_not_running: 'บอทยังไม่ได้รัน', offline: 'ออฟไลน์', day_prefix: 'วันที่',
      mods_none_file: 'ไม่ได้เปิดใช้ม็อด (ไม่พบ modoverrides.lua)',
      mods_none_enabled: 'มีไฟล์ม็อดแต่ไม่มีม็อดที่เปิดใช้',
      enabled_suffix: 'เปิดอยู่', mods_read_error: 'อ่านม็อดไม่ได้: ',
      cluster_read_error: 'อ่าน cluster.ini ไม่ได้ (ตั้งชื่อ cluster ให้ตรงโฟลเดอร์ + ดาวน์โหลด server ก่อน): ',
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
      lbl_cluster: 'Cluster (ชื่อโฟลเดอร์ใน games/DoNotStarveTogether/clusters)',
      lbl_shards: 'Shards (comma, เว้น=auto)',
      lbl_msgInterval: 'embed interval (วิ)', lbl_nameInterval: 'voice name interval (วิ)',
      lbl_showPassword: 'โชว์รหัสผ่านใน embed', lbl_backupKeep: 'เก็บกี่ไฟล์',
      lbl_autoRestart: 'Auto-restart เมื่อ crash', lbl_dailyRestart: 'Restart รายวัน HH:MM (เว้น=ปิด)',
    }
  };
  var LANG = localStorage.getItem('dstLang') || 'en';
  if(LANG !== 'en' && LANG !== 'th') LANG = 'en';
  function t(k){ var d = I18N[LANG] || I18N.en; return (d[k] != null) ? d[k] : (I18N.en[k] != null ? I18N.en[k] : k); }
  function applyLang(){
    document.documentElement.lang = LANG;
    var nodes = document.querySelectorAll('[data-i18n]');
    for(var i=0;i<nodes.length;i++){ nodes[i].textContent = t(nodes[i].getAttribute('data-i18n')); }
    var sel = el('lang'); if(sel) sel.value = LANG;
  }

  var TKEY = 'dstToken';
  function getToken(){ var t0 = localStorage.getItem(TKEY); if(!t0){ t0 = prompt(t('prompt_token')); if(t0) localStorage.setItem(TKEY, t0); } return t0 || ''; }
  function el(id){ return document.getElementById(id); }
  function h(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
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

  var SETUP = [
    { title:'Discord', fields:[
      {p:'discord.token', l:'Bot Token', secret:true, flag:'discord.hasToken'},
      {p:'discord.clientId', l:'Client ID'},
      {p:'discord.guildId', l:'Guild ID'},
      {p:'discord.adminRoleId', l:'Admin Role ID (optional)'},
      {p:'discord.channelCategory', lk:'lbl_channelCategory'},
      {p:'discord.logChannelName', lk:'lbl_logChannelName'},
      {p:'discord.statusTextChannelName', lk:'lbl_statusTextChannelName'},
      {p:'discord.controlChannelName', lk:'lbl_controlChannelName'},
      {p:'discord.actionLogChannelName', lk:'lbl_actionLogChannelName'}
    ]},
    { title:'DST Server', fields:[
      {p:'dst.cluster', lk:'lbl_cluster'},
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

  /** label ของแต่ละ field: lk=คีย์ i18n (แปล), l=ข้อความตรง (ภาษาเดียว เช่นชื่อ technical) */
  function fieldLabel(f){ return f.lk ? t(f.lk) : f.l; }

  function renderSetup(){
    var html = '';
    for(var i=0;i<SETUP.length;i++){
      var sec = SETUP[i];
      html += '<h3>' + h(sec.title) + '</h3>';
      for(var j=0;j<sec.fields.length;j++){
        var f = sec.fields[j];
        html += '<div class="row"><label>' + h(fieldLabel(f)) + '</label>';
        if(f.t === 'bool'){
          html += '<select id="' + f.p + '"><option value="true">true</option><option value="false">false</option></select>';
        } else {
          var type = f.secret ? 'password' : (f.t === 'number' ? 'number' : 'text');
          html += '<input id="' + f.p + '" type="' + type + '">';
        }
        html += '</div>';
      }
    }
    el('setup').innerHTML = html;
  }

  async function loadSetup(){
    var d = await api('/api/setup');
    // sync ภาษาจาก server (config.json) ครั้งแรก ถ้าต่างจากที่จำไว้
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
        if(f.secret && inp.value === '') continue; // เว้นว่าง = คงของเดิม
        setByPath(body, f.p, inp.value);
      }
    }
    try{ var r = await api('/api/setup','POST',body); el('setupnote').textContent = r.note + (r.missing.length? ' · '+t('still_missing')+r.missing.join(', ') : ' '+t('complete')); toast(t('saved_config')); loadState(); }
    catch(e){ toast('✗ '+e.message); }
  }

  async function loadState(){
    try{
      var d = await api('/api/bot/state');
      BOT_STATE = d.state;
      var badge = el('botstate');
      badge.textContent = d.state;
      badge.className = 'badge b-' + d.state;
      var running = d.state === 'running';
      var busy = d.state === 'starting' || d.state === 'stopping';
      el('btn-run').disabled = running || busy || d.missing.length>0;
      el('btn-stop').disabled = (d.state==='stopped') || busy;
      el('btn-rebot').disabled = busy || d.missing.length>0;
      el('missing').textContent = d.missing.length ? (t('still_incomplete') + d.missing.join(', ')) : '';
      document.querySelectorAll('.ctrl').forEach(function(b){ b.disabled = !running; });
      if(d.error) showError(d.error); else clearError();
    }catch(e){
      // ยิง /api/bot/state ไม่ผ่าน = เซิร์ฟเวอร์ปิด/เน็ตหลุด (401 จัดการแยกใน api())
      if(e && e.message !== 'unauthorized') showError(t('disconnected'));
    }
  }

  async function loadStatus(){
    try{
      var d = await api('/api/status');
      if(!d.running){ el('shards').textContent = t('bot_not_running'); el('worldinfo').textContent=''; el('players').textContent=''; return; }
      var icon = { running:'🟢', starting:'🟡', stopping:'🟠', stopped:'🔴' };
      var html = '<table><tr><th>Shard</th><th>State</th><th>PID</th></tr>';
      for(var i=0;i<d.shards.length;i++){ var s=d.shards[i]; html += '<tr><td>'+(icon[s.state]||'⚪')+' '+h(s.shard)+'</td><td>'+h(s.state)+'</td><td>'+(s.pid==null?'-':s.pid)+'</td></tr>'; }
      html += '</table>';
      el('shards').innerHTML = html;
      el('worldinfo').textContent = d.anyRunning ? ('🗓️ '+t('day_prefix')+' '+(d.world&&d.world.day!=null?d.world.day:'?')+' · '+(d.world&&d.world.season?d.world.season:'?')) : t('offline');
      el('players').textContent = '👥 ' + (d.players.length? d.players.join(', ') : '—');
    }catch(e){}
  }

  async function loadMods(){
    try{
      var d = await api('/api/mods');
      if(!d.available){ el('mods').textContent = d.mods ? t('mods_none_file') : t('bot_not_running'); return; }
      if(!d.mods.length){ el('mods').textContent = t('mods_none_enabled'); return; }
      var on = d.mods.filter(function(m){ return m.enabled; }).length;
      var html = '<div class="muted mb-1">'+on+'/'+d.mods.length+' '+t('enabled_suffix')+'</div><ul class="list-none p-0 m-0">';
      for(var i=0;i<d.mods.length;i++){
        var m = d.mods[i];
        html += '<li>'+(m.enabled?'🟢':'⚪')+' <a href="'+h(m.url)+'" target="_blank" rel="noopener" class="text-sky-400 hover:underline">'+h(m.name)+'</a></li>';
      }
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
    loadState(); loadStatus(); loadMods(); loadCluster(); loadServerStatus();
    try{ await api('/api/lang','POST',{language:LANG}); }catch(e){ /* persist พลาดก็ยังสลับฝั่ง client ได้ */ }
  }

  var BOT_STATE = 'stopped';
  var srvPolling = false;

  function renderServer(d){
    el('srvstate').innerHTML = d.installed
      ? '<span class="text-emerald-400">'+h(t('installed'))+'</span>'
      : '<span class="warn">'+h(t('not_installed'))+'</span>';
    el('srvnote').textContent = d.installDir ? ('📁 '+d.installDir) : '';
    // ติดตั้งได้เฉพาะตอนบอทหยุด และไม่ได้กำลังติดตั้งอยู่
    el('btn-install').disabled = d.running || BOT_STATE !== 'stopped';
    renderProgress(d);
    if(d.log && d.log.length){
      var pre = el('srvlog');
      pre.classList.remove('hidden');
      pre.textContent = d.log.join('\\n');
      pre.scrollTop = pre.scrollHeight;
    }
  }

  /** progress bar: determinate ตาม d.progress; ช่วงที่วัด % ไม่ได้ → pulse (indeterminate) */
  function renderProgress(d){
    var wrap = el('srvbar-wrap'), bar = el('srvbar'), pct = el('srvbar-pct');
    if(!wrap) return;
    var phase = d.phase ? (d.phase + ' ') : '';
    if(d.running){
      wrap.classList.remove('hidden');
      bar.classList.remove('bg-rose-500');
      if(d.progress == null){
        bar.classList.add('animate-pulse');
        bar.style.width = '100%';
        pct.textContent = phase + '…';
      } else {
        bar.classList.remove('animate-pulse');
        bar.style.width = d.progress.toFixed(0) + '%';
        pct.textContent = phase + d.progress.toFixed(1) + '%';
      }
    } else if(d.error){
      wrap.classList.remove('hidden');
      bar.classList.remove('animate-pulse');
      bar.classList.add('bg-rose-500');
      pct.textContent = '✗';
    } else if(d.done){
      wrap.classList.remove('hidden');
      bar.classList.remove('animate-pulse','bg-rose-500');
      bar.style.width = '100%';
      pct.textContent = '100%';
    } else {
      wrap.classList.add('hidden');
    }
  }

  async function loadServerStatus(){
    try{ renderServer(await api('/api/server/status')); }catch(e){}
  }

  async function pollServer(){
    if(srvPolling) return;
    srvPolling = true;
    var tick = async function(){
      var d;
      try{ d = await api('/api/server/status'); }catch(e){ d = null; }
      if(d){
        renderServer(d);
        if(d.running){ setTimeout(tick, 1500); return; }
        if(d.error) toast(t('install_failed')+d.error);
        else if(d.done) toast(t('install_done'));
      }
      srvPolling = false;
      loadState();
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

  el('btn-install').addEventListener('click', doInstall);
  el('btn-run').addEventListener('click', function(){ botLifecycle('start'); });
  el('btn-stop').addEventListener('click', function(){ botLifecycle('stop'); });
  el('btn-rebot').addEventListener('click', function(){ botLifecycle('restart'); });
  el('btn-save').addEventListener('click', saveSetup);
  el('errclose').addEventListener('click', clearError);
  el('lang').addEventListener('change', function(e){ changeLang(e.target.value); });

  // จับ error ฝั่ง client (เช่น JS exception / promise reject ที่ไม่ได้ดัก) มาโชว์ด้วย
  window.addEventListener('error', function(e){ toast('✗ ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function(e){
    var m = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
    if(m !== 'unauthorized') toast('✗ ' + m);
  });
  document.addEventListener('click', function(e){
    var t2 = e.target;
    if(t2.classList && t2.classList.contains('clsave')) saveCluster(t2.dataset.key);
    if(t2.classList && t2.classList.contains('ctrl')) ctrlDst(t2.dataset.action);
  });

  applyLang();
  getToken();
  renderSetup();
  loadSetup();
  loadState();
  loadStatus();
  loadCluster();
  loadMods();
  loadServerStatus();
  setInterval(loadState, 4000);
  setInterval(loadStatus, 6000);
  setInterval(function(){ if(!srvPolling) loadServerStatus(); }, 5000);
</script>
</body>
</html>`;
