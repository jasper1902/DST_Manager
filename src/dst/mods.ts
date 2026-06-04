import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DSTConfig } from "../config.js";
import { modOverridesPath } from "./paths.js";

/**
 * อ่าน mod ที่ cluster เปิดใช้จาก modoverrides.lua แล้วแปลงเลข workshop → ชื่อจริง
 *
 * - modoverrides.lua เป็นต่อ shard และ "อาจไม่มี" (เซิร์ฟไม่ลงม็อด) → ดักทุกกรณี
 * - ในไฟล์เก็บเป็น key `["workshop-<id>"]={ ..., enabled=true }` ไม่ใช่ชื่อม็อด
 * - แปลงเป็นชื่อด้วย Steam Web API (public, ไม่ต้องใช้ key) แล้ว cache ลงไฟล์
 *   กันยิงซ้ำทุกครั้งและกันตอนออฟไลน์ — resolve ไม่ได้ค่อย fallback เป็นเลข + ลิงก์
 */

export interface ModEntry {
  /** เลข workshop เช่น "1111658995" */
  id: string;
  /** ชื่อม็อด (resolve จาก Steam แล้ว) — ถ้า resolve ไม่ได้ = "workshop-<id>" */
  name: string;
  /** enabled=true ใน modoverrides.lua หรือไม่ */
  enabled: boolean;
  /** ลิงก์หน้า workshop ของม็อด */
  url: string;
}

/** entry ดิบจากไฟล์ ก่อน resolve ชื่อ */
interface RawMod {
  id: string;
  enabled: boolean;
}

const STEAM_API =
  "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const WORKSHOP_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=";
/** อายุ cache ชื่อม็อด (7 วัน) — ชื่อม็อดแทบไม่เปลี่ยน แต่กันค้างถาวร */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** timeout ยิง Steam API — ถ้าช้า/เน็ตหลุด ปล่อยให้ fallback เป็นเลข */
const FETCH_TIMEOUT_MS = 8_000;

const cacheFile = join(process.cwd(), "mods-cache.json");

type CacheData = Record<string, { title: string; ts: number }>;

/**
 * parse modoverrides.lua แบบ best-effort (regex ไม่ได้ตีความ Lua เต็มรูปแบบ)
 *
 * จับทุก key `["workshop-<id>"]={...}` แล้วหา enabled=true/false ภายใน block ของตัวเอง
 * (block = ตั้งแต่ key นี้จนถึง key ถัดไป) — กัน configuration_options บังค่า enabled
 */
export function parseModOverrides(text: string): RawMod[] {
  const keyRe = /\["workshop-(\d+)"\]\s*=\s*\{/g;
  const matches: { id: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(text)) !== null) {
    matches.push({ id: m[1]!, start: m.index });
  }

  const mods: RawMod[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const block = text.slice(cur.start, next ? next.start : text.length);
    // ม็อดถือว่าเปิดเมื่อไม่ได้ระบุ enabled=false (default ของ DST คือเปิด)
    const enabled = !/\benabled\s*=\s*false\b/.test(block);
    mods.push({ id: cur.id, enabled });
  }
  return mods;
}

/**
 * อ่าน modoverrides.lua จาก shard แรกที่มีไฟล์ (เรียง shards ตามที่ส่งมา)
 * คืน null ถ้าไม่มี shard ไหนมีไฟล์เลย (= เซิร์ฟไม่ได้ลงม็อด)
 */
function readRawMods(dst: DSTConfig, shards: string[]): RawMod[] | null {
  for (const shard of shards) {
    const path = modOverridesPath(dst, shard);
    if (!existsSync(path)) continue;
    try {
      return parseModOverrides(readFileSync(path, "utf8"));
    } catch {
      // ไฟล์อ่านไม่ได้/พัง → ลอง shard ถัดไป
    }
  }
  return null;
}

async function loadCache(): Promise<CacheData> {
  try {
    return JSON.parse(await readFile(cacheFile, "utf8")) as CacheData;
  } catch {
    return {};
  }
}

async function saveCache(cache: CacheData): Promise<void> {
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache), "utf8");
  } catch {
    // cache เขียนไม่ได้ ไม่เป็นไร — แค่ต้อง resolve ใหม่รอบหน้า
  }
}

/** ยิง Steam API ขอ title ของ id ที่ส่งมา; คืน map id→title (id ที่ล้มเหลวไม่อยู่ใน map) */
async function fetchTitles(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;

  const form = new URLSearchParams();
  form.set("itemcount", String(ids.length));
  ids.forEach((id, i) => form.set(`publishedfileids[${i}]`, id));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(STEAM_API, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) return result;
    const data = (await res.json()) as {
      response?: { publishedfiledetails?: { publishedfileid?: string; title?: string }[] };
    };
    for (const d of data.response?.publishedfiledetails ?? []) {
      if (d.publishedfileid && d.title) result.set(d.publishedfileid, d.title);
    }
  } catch {
    // เน็ตหลุด/timeout → คืนเท่าที่ได้ (caller fallback เป็นเลข)
  } finally {
    clearTimeout(timer);
  }
  return result;
}

/** resolve เลข workshop → ชื่อ โดยใช้ cache ก่อน แล้วยิง Steam เฉพาะตัวที่ยังไม่มี/หมดอายุ */
async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const cache = await loadCache();
  const now = Date.now();
  const names = new Map<string, string>();
  const stale: string[] = [];

  for (const id of ids) {
    const hit = cache[id];
    if (hit && now - hit.ts < CACHE_TTL_MS) names.set(id, hit.title);
    else stale.push(id);
  }

  if (stale.length > 0) {
    const fetched = await fetchTitles(stale);
    for (const [id, title] of fetched) {
      names.set(id, title);
      cache[id] = { title, ts: now };
    }
    if (fetched.size > 0) await saveCache(cache);
  }
  return names;
}

/**
 * รายการม็อดที่ cluster เปิดใช้ พร้อมชื่อ (resolve แล้ว) เรียง enabled ก่อน แล้วตามชื่อ
 * คืน null ถ้าไม่มี modoverrides.lua เลย (เซิร์ฟไม่ได้ลงม็อด) — caller แยกข้อความเอง
 */
export async function getModList(
  dst: DSTConfig,
  shards: string[],
): Promise<ModEntry[] | null> {
  const raw = readRawMods(dst, shards);
  if (raw === null) return null;
  if (raw.length === 0) return [];

  const names = await resolveNames(raw.map((r) => r.id));
  const mods: ModEntry[] = raw.map((r) => ({
    id: r.id,
    name: names.get(r.id) ?? `workshop-${r.id}`,
    enabled: r.enabled,
    url: `${WORKSHOP_URL}${r.id}`,
  }));

  mods.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return mods;
}
