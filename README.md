# DST Manager

ระบบจัดการ dedicated server ของ **Don't Starve Together** ควบคุมผ่าน **Discord bot**
รันบน **Windows 11** ด้วย **bun** (process เดียว: bot import core มาเรียกตรง ๆ)

แนวคิด: supervise process + pipe stdin/stdout + แก้ INI — ไม่ต้องมี RCON
เพราะ DST รับคำสั่ง Lua ผ่าน stdin (`-console`) และเขียน log ออก stdout ได้ตรง ๆ

> รายละเอียดสถาปัตยกรรม กลไก DST และ roadmap อยู่ใน [`PROJECT_PROMPT.md`](./PROJECT_PROMPT.md)

## ความต้องการ

- [bun](https://bun.sh) ≥ 1.3 (รัน `.ts` ตรง ๆ ไม่ต้องลง Node แยก)
- DST **Dedicated Server** ติดตั้งแล้ว (มี `bin64\dontstarve_dedicated_server_nullrenderer_x64.exe`)
- cluster ถูกสร้างไว้แล้วใต้ `%USERPROFILE%\Documents\Klei\DoNotStarveTogether\<cluster>\`
  (มี `cluster.ini`, `Master\server.ini`, และ `Caves\server.ini` ถ้ามี caves)
  พร้อม `cluster_token.txt` — bot ตัวนี้ supervise server ที่ตั้งค่าไว้แล้ว ไม่ได้สร้าง cluster ให้
- Discord application + bot token ([Developer Portal](https://discord.com/developers/applications))

> **ข้อจำกัดสำคัญ:** bot ต้องรันบนเครื่อง/ผู้ใช้เดียวกับ DST server เพราะมัน spawn
> binary ในเครื่องจริง ๆ ผ่าน `child_process`

## ติดตั้ง + ตั้งค่า (Windows PowerShell)

ไม่ใช้ `.env` แล้ว — **ตั้งค่าทุกอย่างผ่านหน้า web UI** (เก็บลง `config.json`)

```powershell
bun install
bun start          # เปิด web UI + เปิดเบราว์เซอร์ให้อัตโนมัติ
```

1. `bun start` จะ print **token** ใน console + เปิดเบราว์เซอร์ไป `http://127.0.0.1:8787`
2. ใส่ token (จาก console) ตอนเข้าเว็บครั้งแรก
3. กรอกค่าในหน้า **setup** (Discord token/client/guild, DST install dir/cluster, ฯลฯ) แล้วกด **บันทึก**
4. กดปุ่ม **▶️ รันบอท** — bot จะ login, register slash command, สร้างห้อง Discord ให้เอง

ค่าที่ **จำเป็น** ต้องกรอกก่อนรันได้: Discord token, client ID, guild ID, DST install dir, DST cluster
(ที่เหลือมี default; `DST_PERSISTENT_ROOT` default = `%USERPROFILE%\Documents\Klei`,
shards เว้นว่าง = auto-discover จากโฟลเดอร์ที่มี `server.ini`)

> ถ้าไม่ตั้ง admin role ID คำสั่งกลุ่ม control จะ **ไม่บังคับ role** (ใครก็สั่งได้) — ใช้เฉพาะตอน dev

> **ห้องสร้างอัตโนมัติ:** ตอน start bot จะสร้าง category + ห้องเหล่านี้ให้เอง แล้วจำ
> channel ID ไว้ใน `channels.json` กันสร้างซ้ำ:
> - **log** (text) — mirror log + แจ้งเตือน crash
> - **status** (text, read-only) — embed สถานะ/วัน/ฤดู/ผู้เล่น
> - **status** (voice) — ชื่อห้อง = สถานะ + จำนวนผู้เล่น
> - **control** (read-only) — ปุ่มสั่งงาน (Start/Stop/Restart/Save/Backup/Status/Players) เช็คสิทธิ์ตาม `DISCORD_ADMIN_ROLE_ID`
> - **action log** (เห็นเฉพาะ admin role) — บันทึกว่าใครใช้คำสั่ง/ปุ่มอะไร
>
> ต้องมีสิทธิ์ **Manage Channels** (สร้างห้อง) และ **Manage Roles** (ตั้ง read-only/admin-only)

## Slash commands

| คำสั่ง | หน้าที่ | control* |
|---|---|---|
| `/start` | เปิด server (Master ก่อน แล้ว shard อื่น) | ✓ |
| `/stop` | ปิด graceful (`c_shutdown(true)` → timeout → `taskkill /T /F`) | ✓ |
| `/restart` | stop แล้ว start | ✓ |
| `/status` | สถานะแต่ละ shard | |
| `/logs [shard] [lines]` | log ล่าสุดจาก ring buffer | |
| `/players` | ผู้เล่นออนไลน์ (best-effort จาก `c_listallplayers`) | |
| `/announce <message>` | ประกาศให้ผู้เล่นทุก shard | ✓ |
| `/save` | บันทึกโลก | ✓ |
| `/rollback [count]` | ย้อนโลก n save — **ปุ่มยืนยัน + backup ก่อนอัตโนมัติ** | ✓ |
| `/regenerate` | สร้างโลกใหม่ทั้งหมด — **ปุ่มยืนยัน + backup ก่อนอัตโนมัติ** | ✓ |
| `/backup create [label]` | สร้าง backup เซฟ (.tar.gz) | ✓ |
| `/backup list` | ดูรายการ backup | ✓ |
| `/backup restore <file>` | กู้ backup (ต้อง `/stop` ก่อน — ปุ่มยืนยัน) | ✓ |
| `/config show` | ดูค่า config ที่ whitelist (ephemeral, ปิด password) | ✓ |
| `/config set <key> <value>` | ตั้งค่า config — **มีผลตอน restart** | ✓ |

\* คำสั่ง control ต้องมี role ตาม `DISCORD_ADMIN_ROLE_ID` (ถ้าตั้งไว้)

config ที่แก้ได้ถูก whitelist ไว้ใน [`src/dst/clusterConfig.ts`](./src/dst/clusterConfig.ts):
`cluster_name`, `cluster_description`, `cluster_password`, `cluster_intention`,
`game_mode`, `max_players`, `pvp`, `pause_when_empty`

## โครงสร้าง

```
src/
  config.ts                env + path config
  dst/
    paths.ts               resolve install/cluster/shard paths (Windows .exe)
    console.ts             สร้าง string คำสั่ง Lua
    logParser.ts           best-effort: log line -> event (ต้องจูน regex)
    process.ts             ShardProcess: spawn, stdin, stdout ring buffer, taskkill
    manager.ts             DSTManager: orchestrate shards  ← core API (transport-agnostic)
    clusterConfig.ts       อ่าน/เขียน INI key ที่ whitelist
  discord/
    commands.ts            schema ของ slash command
    register.ts            สคริปต์ register
    bot.ts                 map interaction -> เรียก manager
  index.ts                 entrypoint (manager + bot ใน process เดียว)
```

หัวใจ: **`DSTManager` transport-agnostic** ไม่ผูกกับ Discord — วันหลังจะครอบด้วย
HTTP/WS server เพื่อทำ web UI หรือแยก daemon ได้โดยไม่แตะ core

## ข้อควรรู้ / ข้อจำกัด

- **Log parsing เป็น best-effort** — wording ของ log เปลี่ยนตามเวอร์ชันเกม
  ต้องจูน regex ใน `logParser.ts` กับ `server_log.txt` จริง (`/players` พึ่ง parse นี้)
  สถานะ process ขึ้น/ลง (`/status`) เชื่อถือได้เสมอเพราะดูจาก process จริง
- world settings จริง (ฤดู/ทรัพยากร) อยู่ใน `worldgenoverride.lua` (Lua table) — **ยังไม่รองรับใน v1**
- mods — ยังไม่รองรับใน v1 (อยู่ใน roadmap phase 2)
- **Backup** ใช้ `tar` ที่ติดมากับ Windows 10+/Linux/macOS (ไม่ต้องลง dependency); ไฟล์เป็น `.tar.gz`
  ของทั้งโฟลเดอร์ cluster เก็บไว้นอก cluster dir — `restore` ต้อง `/stop` ก่อน
- **Auto-restart**: shard ที่ตายเองจะถูก start ใหม่อัตโนมัติ แต่ถ้า crash เกิน 3 ครั้งใน 2 นาที
  จะหยุดแล้ว ping admin (กัน crash loop); สั่ง `/stop` เองไม่ถือเป็น crash

## Web UI

`bun start` เปิด web UI ตลอด (เป็น entry point) — บอท **ไม่ auto-start**, เปิด/ปิดจากปุ่มในเว็บ

หน้าเว็บมี: setup config ทุกอย่าง (บันทึกลง `config.json`), ปุ่มรัน/หยุด/restart บอท,
ดูสถานะ shard/ผู้เล่น/วัน-ฤดู, แก้ `cluster.ini`, และปุ่มสั่งงาน DST

เป็น transport อีกตัวที่ครอบ `DSTManager` ตัวเดียวกับ Discord bot (core ไม่ผูกกับ transport)

> **ความปลอดภัย:** bind `127.0.0.1` เท่านั้นโดย default (เข้าได้เฉพาะในเครื่อง) ทุก API ต้องมี token
> (gen ให้อัตโนมัติครั้งแรก เก็บใน `config.json`) — ถ้าจะเข้าจากเครื่องอื่น **อย่าเปิด `0.0.0.0` ตรง ๆ**
> ให้ผ่าน reverse proxy + HTTPS. `config.json` มี secret → ถูก gitignore แล้ว

## Dev

```powershell
bun run typecheck   # tsc --noEmit (strict)
```
