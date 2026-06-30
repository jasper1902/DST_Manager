/**
 * อ่าน/เขียน worldgenoverride.lua แบบฟอร์ม (ไม่ต้องแก้ Lua ดิบ)
 *
 * worldgenoverride.lua = ค่าการ "สร้างโลก" ต่อ shard:
 *   return { override_enabled=true, preset="SURVIVAL_TOGETHER", overrides={ key=value, ... } }
 *
 * ⚠️ มีผลตอน "สร้างโลกใหม่ (regenerate)" เท่านั้น — ไม่กระทบเซฟที่มีอยู่แล้ว
 *
 * schema ของตัวเลือก (key + ค่าที่อนุญาต) เป็น curated subset ของออปชันมาตรฐาน DST
 * (ตัวเต็มอยู่ใน data เกมที่ compile แล้ว อ่านตรงไม่ได้) — key ที่ไม่รู้จักในไฟล์เดิมถูกเก็บไว้ตอน save
 */

import { luaValue, type LuaValue, matchBrace } from "./modConfig.js";

export interface WorldChoice {
  description: string;
  data: LuaValue;
}
export interface WorldOption {
  name: string; // key ใน overrides
  label: string;
  options: WorldChoice[];
}
export interface WorldGroup {
  group: string;
  options: WorldOption[];
}

export interface WorldGenData {
  overrideEnabled: boolean;
  preset: string | null;
  overrides: Record<string, LuaValue>;
}

// ── value sets (ค่าที่อนุญาต + label อ่านง่าย) ────────────────────────────
const DENSITY: Array<[string, string]> = [
  ["never", "None"],
  ["rare", "Less"],
  ["default", "Default"],
  ["often", "More"],
  ["mostly", "Lots"],
];
const SEASON_LEN: Array<[string, string]> = [
  ["noseason", "None"],
  ["veryshort", "Very short"],
  ["short", "Short"],
  ["default", "Default"],
  ["long", "Long"],
  ["verylong", "Very long"],
];

function choices(vals: Array<[string, string]>): WorldChoice[] {
  return vals.map(([data, description]) => ({ data, description }));
}
function pick(vals: string[], labels?: Record<string, string>): WorldChoice[] {
  return vals.map((v) => ({ data: v, description: labels?.[v] ?? v.charAt(0).toUpperCase() + v.slice(1) }));
}
/** density option (never..mostly) */
function dens(name: string, label: string): WorldOption {
  return { name, label, options: choices(DENSITY) };
}

/** curated schema — กลุ่มออปชันที่ใช้บ่อย */
export const WORLD_SCHEMA: WorldGroup[] = [
  {
    group: "World",
    options: [
      { name: "world_size", label: "World size", options: pick(["small", "medium", "default", "huge"]) },
      { name: "branching", label: "Branching", options: pick(["never", "least", "default", "most"]) },
      { name: "loop", label: "Loop", options: pick(["never", "default", "always"]) },
      { name: "task_set", label: "Task set", options: pick(["default", "classic"]) },
      { name: "start_location", label: "Start location", options: pick(["default", "plus", "darkness", "caves"]) },
      { name: "touchstone", label: "Touch stones", options: choices(DENSITY) },
      { name: "boons", label: "Sunken chest / boons", options: choices(DENSITY) },
      { name: "prefabswaps_start", label: "Start items set", options: pick(["default", "classic", "highly random"]) },
    ],
  },
  {
    group: "Seasons & day",
    options: [
      { name: "season_start", label: "Starting season", options: pick(["default", "autumn", "winter", "spring", "summer"]) },
      { name: "autumn", label: "Autumn length", options: choices(SEASON_LEN) },
      { name: "winter", label: "Winter length", options: choices(SEASON_LEN) },
      { name: "spring", label: "Spring length", options: choices(SEASON_LEN) },
      { name: "summer", label: "Summer length", options: choices(SEASON_LEN) },
      {
        name: "day",
        label: "Day/night",
        options: pick(["default", "longday", "longdusk", "longnight", "noday", "nodusk", "nonight", "onlyday", "onlydusk", "onlynight"]),
      },
    ],
  },
  {
    group: "Resources",
    options: [
      dens("berrybush", "Berry bushes"),
      dens("sapling", "Saplings"),
      dens("grass", "Grass"),
      dens("reeds", "Reeds"),
      dens("trees", "Trees"),
      dens("flint", "Flint"),
      dens("rock", "Rocks"),
      dens("rock_ice", "Ice"),
      dens("meteorspawner", "Meteors"),
      dens("mushroom", "Mushrooms"),
      dens("flowers", "Flowers"),
      dens("cactus", "Cacti"),
      dens("tumbleweed", "Tumbleweeds"),
      dens("carrots_regrowth", "Carrots"),
    ],
  },
  {
    group: "Creatures",
    options: [
      dens("rabbits", "Rabbits"),
      dens("moles", "Moles"),
      dens("butterfly", "Butterflies"),
      dens("birds", "Birds"),
      dens("buzzard", "Buzzards"),
      dens("catcoon", "Catcoons"),
      dens("perd", "Gobblers"),
      dens("pigs", "Pigs"),
      dens("lightninggoat", "Volt goats"),
      dens("beefalo", "Beefalo"),
      dens("hounds", "Hounds"),
      dens("spiders", "Spiders"),
      dens("tentacles", "Tentacles"),
      dens("merm", "Merms"),
      dens("frogs", "Frogs"),
      dens("bees", "Bees"),
      dens("mosquitos", "Mosquitos"),
    ],
  },
  {
    group: "Giants & events",
    options: [
      dens("deerclops", "Deerclops"),
      dens("bearger", "Bearger"),
      dens("dragonfly", "Dragonfly"),
      dens("antliontribute", "Antlion"),
      dens("goosemoose", "Moose/Goose"),
      dens("liefs", "Treeguards"),
      dens("krampus", "Krampii"),
      dens("regrowth", "Regrowth"),
      dens("wildfires", "Summer wildfires"),
    ],
  },
];

/** ทุก key ที่อยู่ใน schema (ใช้ตรวจ/จัดลำดับ) */
export function schemaKeys(): Set<string> {
  return new Set(WORLD_SCHEMA.flatMap((g) => g.options.map((o) => o.name)));
}

// ── parse / serialize ─────────────────────────────────────────────────────

function parseLua(raw: string): LuaValue {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s.startsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'")) return s.slice(1, -1);
  return Number(s);
}

/** parse worldgenoverride.lua → { overrideEnabled, preset, overrides } (best-effort) */
export function parseWorldGen(text: string): WorldGenData {
  const enabled = /override_enabled\s*=\s*(true|false)/.exec(text);
  const preset = /\bpreset\s*=\s*"([^"]*)"/.exec(text);
  const overrides: Record<string, LuaValue> = {};
  const co = /overrides\s*=\s*\{/.exec(text);
  if (co) {
    const open = co.index + co[0].length - 1;
    const close = matchBrace(text, open);
    if (close > 0) {
      const inner = text.slice(open + 1, close);
      const re = /(?:\[\s*"([^"]+)"\s*\]|([A-Za-z_]\w*))\s*=\s*(true|false|-?\d+\.?\d*|"[^"]*"|'[^']*')/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(inner)) !== null) {
        const key = m[1] ?? m[2];
        if (key !== undefined && m[3] !== undefined) overrides[key] = parseLua(m[3]);
      }
    }
  }
  return {
    overrideEnabled: enabled ? enabled[1] === "true" : true,
    preset: preset ? (preset[1] ?? null) : null,
    overrides,
  };
}

/** serialize กลับเป็น worldgenoverride.lua */
export function serializeWorldGen(d: WorldGenData): string {
  const keys = Object.keys(d.overrides).sort();
  const pairs = keys.map((k) => `    ${k}=${luaValue(d.overrides[k] as LuaValue)}`).join(",\n");
  return (
    "return {\n" +
    `  override_enabled=${d.overrideEnabled ? "true" : "false"},\n` +
    (d.preset ? `  preset=${luaValue(d.preset)},\n` : "") +
    "  overrides={\n" +
    (pairs ? `${pairs}\n` : "") +
    "  },\n}\n"
  );
}

/** อ่านไฟล์ → data (ถ้าไม่มีไฟล์คืน default ว่าง) */
export function readWorldGen(text: string | null): WorldGenData {
  if (!text || text.trim() === "") return { overrideEnabled: true, preset: "SURVIVAL_TOGETHER", overrides: {} };
  return parseWorldGen(text);
}

/** merge ค่าใหม่จากฟอร์มเข้ากับของเดิม (เก็บ key ที่ไม่รู้จักไว้) แล้ว serialize */
export function applyWorldGen(prev: string | null, values: Record<string, LuaValue>, overrideEnabled?: boolean): string {
  const cur = readWorldGen(prev);
  const merged: WorldGenData = {
    overrideEnabled: overrideEnabled ?? cur.overrideEnabled,
    preset: cur.preset ?? "SURVIVAL_TOGETHER",
    overrides: { ...cur.overrides, ...values },
  };
  return serializeWorldGen(merged);
}
