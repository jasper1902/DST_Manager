/** หน้า web UI: setup config + ปุ่มรันบอท + dashboard (เสิร์ฟโดย web/server.ts) */
export const PAGE = `<!doctype html>
<html lang="th">
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
  }
</style>
</head>
<body class="font-sans">
<header class="sticky top-0 z-20 backdrop-blur-md bg-slate-950/60 border-b border-slate-800/80 px-6 py-4 flex items-center gap-2.5 text-lg font-semibold">
  <span class="text-2xl">🌳</span>
  <span class="bg-gradient-to-r from-emerald-300 via-teal-300 to-indigo-300 bg-clip-text text-transparent">DST Manager</span>
</header>
<main class="max-w-3xl mx-auto p-5">
  <div id="errbar" class="hidden items-start gap-3 bg-rose-950/60 border border-rose-500/50 text-rose-200 rounded-xl px-4 py-3 mb-5 text-sm shadow-lg shadow-rose-900/30">
    <span class="text-lg leading-none mt-0.5">⚠️</span>
    <span id="errmsg" class="flex-1 break-words whitespace-pre-wrap"></span>
    <button id="errclose" class="ghost !bg-transparent hover:!bg-rose-500/20 !text-rose-200 !px-2 !py-1 -mt-1 -mr-1">✕</button>
  </div>

  <div class="card">
    <h2>🤖 บอท</h2>
    <div class="controls">
      <span class="text-sm text-slate-400">สถานะ:</span> <span id="botstate" class="badge b-stopped">...</span>
      <button id="btn-run" class="ok">▶️ รันบอท</button>
      <button id="btn-stop" class="danger">⏹️ หยุด</button>
      <button id="btn-rebot" class="ghost">🔄 restart</button>
    </div>
    <div id="missing" class="warn mt-3"></div>
  </div>

  <div class="card">
    <h2>⚙️ ตั้งค่า (config.json)</h2>
    <div id="setup" class="text-slate-400 text-sm">กำลังโหลด...</div>
    <div class="controls mt-4">
      <button id="btn-save">💾 บันทึก config</button>
      <span id="setupnote" class="muted"></span>
    </div>
  </div>

  <div class="card">
    <h2>📥 DST Server <span class="muted normal-case tracking-normal font-normal">(ดาวน์โหลด/อัปเดตผ่าน SteamCMD)</span></h2>
    <div class="controls">
      <span class="text-sm text-slate-400">สถานะ:</span> <span id="srvstate" class="text-sm text-slate-300">...</span>
      <button id="btn-install" class="ok">⬇️ ดาวน์โหลด/อัปเดต DST server</button>
    </div>
    <div id="srvnote" class="muted mt-2"></div>
    <pre id="srvlog" class="hidden mt-3 max-h-64"></pre>
  </div>

  <div class="card">
    <h2>📊 สถานะ server</h2>
    <div id="shards" class="text-slate-400 text-sm">—</div>
    <div id="worldinfo"></div>
    <div id="players"></div>
  </div>

  <div class="card">
    <h2>🧩 ม็อดที่ใช้ <span class="muted normal-case tracking-normal font-normal">(จาก modoverrides.lua)</span></h2>
    <div id="mods" class="text-slate-400 text-sm">—</div>
  </div>

  <div class="card">
    <h2>🎮 ควบคุม DST <span class="muted normal-case tracking-normal font-normal">(ต้องรันบอทก่อน)</span></h2>
    <div class="controls">
      <button class="ctrl ok" data-action="start">▶️ Start</button>
      <button class="ctrl danger" data-action="stop">⏹️ Stop</button>
      <button class="ctrl" data-action="restart">🔄 Restart</button>
      <button class="ctrl ghost" data-action="save">💾 Save</button>
      <button class="ctrl ghost" data-action="backup">🗄️ Backup</button>
    </div>
  </div>

  <div class="card">
    <h2>📝 cluster.ini <span class="muted normal-case tracking-normal font-normal">(มีผลตอน restart DST)</span></h2>
    <div id="cluster" class="text-slate-400 text-sm">—</div>
  </div>
</main>
<div id="toast"></div>
<script>
  var TKEY = 'dstToken';
  function getToken(){ var t = localStorage.getItem(TKEY); if(!t){ t = prompt('ใส่ Web token (ดูจาก console ที่รัน bun start):'); if(t) localStorage.setItem(TKEY, t); } return t || ''; }
  function el(id){ return document.getElementById(id); }
  function h(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function toast(m){ var t = el('toast'); t.textContent = m; t.style.opacity = '1'; setTimeout(function(){ t.style.opacity='0'; }, 4500); }
  function showError(m){ var b = el('errbar'); el('errmsg').textContent = m; b.classList.remove('hidden'); b.classList.add('flex'); }
  function clearError(){ var b = el('errbar'); b.classList.add('hidden'); b.classList.remove('flex'); }
  function getByPath(o,p){ return p.split('.').reduce(function(a,k){ return a==null?undefined:a[k]; }, o); }
  function setByPath(o,p,v){ var ks=p.split('.'); var c=o; for(var i=0;i<ks.length-1;i++){ if(!c[ks[i]]) c[ks[i]]={}; c=c[ks[i]]; } c[ks[ks.length-1]]=v; }

  async function api(path, method, body){
    var res = await fetch(path, { method: method||'GET', headers: { 'x-dst-token': getToken(), 'content-type':'application/json' }, body: body?JSON.stringify(body):undefined });
    if(res.status === 401){ localStorage.removeItem(TKEY); alert('token ผิด — ลองใหม่'); location.reload(); throw new Error('unauthorized'); }
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
      {p:'discord.channelCategory', l:'หมวดห้อง'},
      {p:'discord.logChannelName', l:'ชื่อห้อง log'},
      {p:'discord.statusTextChannelName', l:'ชื่อห้อง status'},
      {p:'discord.controlChannelName', l:'ชื่อห้อง control'},
      {p:'discord.actionLogChannelName', l:'ชื่อห้อง action log'}
    ]},
    { title:'DST Server', fields:[
      {p:'dst.cluster', l:'Cluster (ชื่อโฟลเดอร์ใน games/DoNotStarveTogether/clusters)'},
      {p:'dst.shards', l:'Shards (comma, เว้น=auto)'}
    ]},
    { title:'Status', fields:[
      {p:'status.messageIntervalSec', l:'embed interval (วิ)', t:'number'},
      {p:'status.nameIntervalSec', l:'voice name interval (วิ)', t:'number'},
      {p:'status.showPassword', l:'โชว์รหัสผ่านใน embed', t:'bool'}
    ]},
    { title:'Backup', fields:[
      {p:'backup.dir', l:'Backup Dir'},
      {p:'backup.keep', l:'เก็บกี่ไฟล์', t:'number'}
    ]},
    { title:'Supervisor', fields:[
      {p:'autoRestart', l:'Auto-restart เมื่อ crash', t:'bool'},
      {p:'dailyRestartTime', l:'Restart รายวัน HH:MM (เว้น=ปิด)'}
    ]},
    { title:'Web / Misc', fields:[
      {p:'web.host', l:'Web host'},
      {p:'web.port', l:'Web port', t:'number'},
      {p:'web.token', l:'Web token', secret:true, flag:'web.hasToken'},
      {p:'logBufferSize', l:'Log buffer size', t:'number'}
    ]}
  ];

  function renderSetup(){
    var html = '';
    for(var i=0;i<SETUP.length;i++){
      var sec = SETUP[i];
      html += '<h3>' + h(sec.title) + '</h3>';
      for(var j=0;j<sec.fields.length;j++){
        var f = sec.fields[j];
        html += '<div class="row"><label>' + h(f.l) + '</label>';
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
    for(var i=0;i<SETUP.length;i++){
      for(var j=0;j<SETUP[i].fields.length;j++){
        var f = SETUP[i].fields[j];
        var inp = el(f.p);
        if(!inp) continue;
        if(f.secret){
          inp.value = '';
          inp.placeholder = getByPath(d, f.flag) ? '(ตั้งไว้แล้ว — กรอกเพื่อเปลี่ยน)' : '(ยังไม่ตั้ง)';
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
    try{ var r = await api('/api/setup','POST',body); el('setupnote').textContent = r.note + (r.missing.length? ' · ยังขาด: '+r.missing.join(', ') : ' ✓ ครบ'); toast('บันทึก config แล้ว'); loadState(); }
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
      el('missing').textContent = d.missing.length ? ('⚠️ ยังกรอกไม่ครบ: ' + d.missing.join(', ')) : '';
      document.querySelectorAll('.ctrl').forEach(function(b){ b.disabled = !running; });
      if(d.error) showError(d.error); else clearError();
    }catch(e){
      // ยิง /api/bot/state ไม่ผ่าน = เซิร์ฟเวอร์ปิด/เน็ตหลุด (401 จัดการแยกใน api())
      if(e && e.message !== 'unauthorized') showError('🔌 ขาดการเชื่อมต่อกับ DST Manager — เซิร์ฟเวอร์อาจถูกปิดอยู่');
    }
  }

  async function loadStatus(){
    try{
      var d = await api('/api/status');
      if(!d.running){ el('shards').textContent = 'บอทยังไม่ได้รัน'; el('worldinfo').textContent=''; el('players').textContent=''; return; }
      var icon = { running:'🟢', starting:'🟡', stopping:'🟠', stopped:'🔴' };
      var html = '<table><tr><th>Shard</th><th>State</th><th>PID</th></tr>';
      for(var i=0;i<d.shards.length;i++){ var s=d.shards[i]; html += '<tr><td>'+(icon[s.state]||'⚪')+' '+h(s.shard)+'</td><td>'+h(s.state)+'</td><td>'+(s.pid==null?'-':s.pid)+'</td></tr>'; }
      html += '</table>';
      el('shards').innerHTML = html;
      el('worldinfo').textContent = d.anyRunning ? ('🗓️ วันที่ '+(d.world&&d.world.day!=null?d.world.day:'?')+' · '+(d.world&&d.world.season?d.world.season:'?')) : 'ออฟไลน์';
      el('players').textContent = '👥 ' + (d.players.length? d.players.join(', ') : '—');
    }catch(e){}
  }

  async function loadMods(){
    try{
      var d = await api('/api/mods');
      if(!d.available){ el('mods').textContent = d.mods ? 'ไม่ได้เปิดใช้ม็อด (ไม่พบ modoverrides.lua)' : 'บอทยังไม่ได้รัน'; return; }
      if(!d.mods.length){ el('mods').textContent = 'มีไฟล์ม็อดแต่ไม่มีม็อดที่เปิดใช้'; return; }
      var on = d.mods.filter(function(m){ return m.enabled; }).length;
      var html = '<div class="muted mb-1">'+on+'/'+d.mods.length+' เปิดอยู่</div><ul class="list-none p-0 m-0">';
      for(var i=0;i<d.mods.length;i++){
        var m = d.mods[i];
        html += '<li>'+(m.enabled?'🟢':'⚪')+' <a href="'+h(m.url)+'" target="_blank" rel="noopener" class="text-sky-400 hover:underline">'+h(m.name)+'</a></li>';
      }
      html += '</ul>';
      el('mods').innerHTML = html;
    }catch(e){ el('mods').innerHTML = '<span class="warn">อ่านม็อดไม่ได้: '+h(e.message)+'</span>'; }
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
          html += '<input id="cl-'+h(f.key)+'" type="'+(f.sensitive?'password':'text')+'" value="'+h(f.value)+'"'+(f.sensitive?' placeholder="(ไม่แสดง — กรอกเพื่อเปลี่ยน)"':'')+'>';
        }
        html += '<button class="clsave" data-key="'+h(f.key)+'">บันทึก</button></div>';
      }
      el('cluster').innerHTML = html;
    }catch(e){ el('cluster').innerHTML = '<span class="warn">อ่าน cluster.ini ไม่ได้ (ตั้งชื่อ cluster ให้ตรงโฟลเดอร์ + ดาวน์โหลด server ก่อน): '+h(e.message)+'</span>'; }
  }

  async function saveCluster(key){
    var inp = el('cl-'+key); if(!inp) return;
    try{ var r = await api('/api/config','POST',{key:key,value:inp.value}); toast('✓ '+r.key+' = '+r.value+' ('+r.note+')'); }
    catch(e){ toast('✗ '+e.message); }
  }

  async function ctrlDst(action){
    if((action==='stop'||action==='restart')&&!confirm('ยืนยัน '+action+' ?')) return;
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

  var BOT_STATE = 'stopped';
  var srvPolling = false;

  function renderServer(d){
    el('srvstate').innerHTML = d.installed
      ? '<span class="text-emerald-400">✓ ติดตั้งแล้ว</span>'
      : '<span class="warn">ยังไม่ได้ติดตั้ง</span>';
    el('srvnote').textContent = d.installDir ? ('📁 '+d.installDir) : '';
    // ติดตั้งได้เฉพาะตอนบอทหยุด และไม่ได้กำลังติดตั้งอยู่
    el('btn-install').disabled = d.running || BOT_STATE !== 'stopped';
    if(d.log && d.log.length){
      var pre = el('srvlog');
      pre.classList.remove('hidden');
      pre.textContent = d.log.join('\\n');
      pre.scrollTop = pre.scrollHeight;
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
        if(d.error) toast('✗ ติดตั้งไม่สำเร็จ: '+d.error);
        else if(d.done) toast('✓ ติดตั้ง DST server เสร็จแล้ว');
      }
      srvPolling = false;
      loadState();
    };
    tick();
  }

  async function doInstall(){
    if(BOT_STATE !== 'stopped'){ toast('⚠️ ต้องหยุดบอทก่อนถึงจะติดตั้งได้'); return; }
    if(!confirm('ดาวน์โหลด/อัปเดต DST server ผ่าน SteamCMD ? (อาจใช้เวลาหลายนาที)')) return;
    el('btn-install').disabled = true;
    el('srvlog').classList.remove('hidden');
    el('srvlog').textContent = '⏳ เริ่มติดตั้ง...';
    try{ await api('/api/server/install','POST'); pollServer(); }
    catch(e){ toast('✗ '+e.message); loadServerStatus(); }
  }

  el('btn-install').addEventListener('click', doInstall);
  el('btn-run').addEventListener('click', function(){ botLifecycle('start'); });
  el('btn-stop').addEventListener('click', function(){ botLifecycle('stop'); });
  el('btn-rebot').addEventListener('click', function(){ botLifecycle('restart'); });
  el('btn-save').addEventListener('click', saveSetup);
  el('errclose').addEventListener('click', clearError);

  // จับ error ฝั่ง client (เช่น JS exception / promise reject ที่ไม่ได้ดัก) มาโชว์ด้วย
  window.addEventListener('error', function(e){ toast('✗ ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function(e){
    var m = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
    if(m !== 'unauthorized') toast('✗ ' + m);
  });
  document.addEventListener('click', function(e){
    var t = e.target;
    if(t.classList && t.classList.contains('clsave')) saveCluster(t.dataset.key);
    if(t.classList && t.classList.contains('ctrl')) ctrlDst(t.dataset.action);
  });

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
