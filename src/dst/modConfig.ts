/**
 * แก้ modoverrides.lua แบบ "surgical" (แตะเฉพาะ block ของม็อดที่เลือก) + อ่าน schema config
 * จาก modinfo.lua แบบ heuristic — ไม่ใช้ Lua parser/VM (กัน dep) และไม่ re-serialize ทั้งไฟล์
 * (กัน config ที่คนเขียนเองหาย) ม็อดที่ modinfo แปลก/สร้าง option แบบ programmatic → parse ไม่ได้
 * คืน schema ว่าง (caller ให้ไปใช้ raw editor แทน)
 */

export type LuaValue = string | number | boolean;
export interface ModConfigChoice {
  description: string;
  data: LuaValue;
}
export interface ModConfigOption {
  name: string;
  label: string;
  options: ModConfigChoice[];
  default: LuaValue | null;
}

const VAL_RE = /^(true|false|-?\d+\.?\d*|"(?:[^"\\]|\\.)*")$/;

function parseLuaValue(raw: string): LuaValue {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s.startsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return Number(s);
}

/** serialize ค่ากลับเป็น Lua literal */
export function luaValue(v: LuaValue): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** index ของ '}' ที่จับคู่กับ '{' ที่ openIdx (ข้าม brace ใน string); -1 ถ้าไม่เจอ */
export function matchBrace(text: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

interface Block {
  keyStart: number;
  open: number;
  close: number;
}

/** หา block ของม็อด ["workshop-<id>"]={...} (id = ตัวเลขล้วน) */
function findModBlock(text: string, id: string): Block | null {
  const m = new RegExp(`\\["workshop-${id}"\\]\\s*=\\s*\\{`).exec(text);
  if (!m) return null;
  const open = m.index + m[0].length - 1; // ตำแหน่ง '{'
  const close = matchBrace(text, open);
  return close < 0 ? null : { keyStart: m.index, open, close };
}

export function hasMod(text: string, id: string): boolean {
  return findModBlock(text, id) !== null;
}

/** เปิด/ปิดม็อด — แทน enabled= เดิม หรือ inject ถ้าไม่มี */
export function setModEnabled(text: string, id: string, enabled: boolean): string {
  const b = findModBlock(text, id);
  if (!b) return text;
  const block = text.slice(b.open, b.close + 1);
  const val = enabled ? "true" : "false";
  const next = /\benabled\s*=\s*(?:true|false)\b/.test(block)
    ? block.replace(/\benabled\s*=\s*(?:true|false)\b/, `enabled=${val}`)
    : block.replace(/^\{/, `{ enabled=${val},`);
  return text.slice(0, b.open) + next + text.slice(b.close + 1);
}

/** เพิ่มม็อดใหม่ (ถ้ามีแล้ว → แค่เปิด); สร้างไฟล์ใหม่ถ้ายังไม่มี return {} */
export function addMod(text: string, id: string): string {
  if (findModBlock(text, id)) return setModEnabled(text, id, true);
  const entry = `\n  ["workshop-${id}"]={ enabled=true },`;
  const ret = /return\s*\{/.exec(text);
  if (!ret) return `return {${entry}\n}\n`;
  const at = ret.index + ret[0].length;
  return text.slice(0, at) + entry + text.slice(at);
}

/** ลบม็อด (block + comma ท้าย + newline/indent นำหน้า); Lua อนุญาต trailing comma อยู่แล้ว */
export function removeMod(text: string, id: string): string {
  const b = findModBlock(text, id);
  if (!b) return text;
  let start = b.keyStart;
  let end = b.close + 1;
  const trailComma = text.slice(end).match(/^\s*,/);
  if (trailComma) end += trailComma[0].length;
  const lead = text.slice(0, start).match(/\n[ \t]*$/);
  if (lead) start -= lead[0].length;
  return text.slice(0, start) + text.slice(end);
}

/** อ่าน configuration_options ปัจจุบันของม็อด → { name: value } */
export function readModConfigValues(text: string, id: string): Record<string, LuaValue> {
  const b = findModBlock(text, id);
  if (!b) return {};
  const block = text.slice(b.open, b.close + 1);
  const co = /configuration_options\s*=\s*\{/.exec(block);
  if (!co) return {};
  const coOpen = co.index + co[0].length - 1;
  const coClose = matchBrace(block, coOpen);
  if (coClose < 0) return {};
  const inner = block.slice(coOpen + 1, coClose);
  const out: Record<string, LuaValue> = {};
  // รองรับทั้ง ["name"]=value และ name=value
  const re = /(?:\[\s*"([^"]+)"\s*\]|([A-Za-z_]\w*))\s*=\s*(true|false|-?\d+\.?\d*|"(?:[^"\\]|\\.)*")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const key = m[1] ?? m[2];
    if (key !== undefined && m[3] !== undefined) out[key] = parseLuaValue(m[3]);
  }
  return out;
}

/** เขียน configuration_options ของม็อดจาก values (แทนของเดิม หรือ inject) */
export function setModConfig(text: string, id: string, values: Record<string, LuaValue>): string {
  const b = findModBlock(text, id);
  if (!b) return text;
  const block = text.slice(b.open, b.close + 1);
  const pairs = Object.entries(values)
    .map(([k, v]) => `["${k}"]=${luaValue(v)}`)
    .join(", ");
  const cfg = `configuration_options={ ${pairs} }`;
  const co = /configuration_options\s*=\s*\{/.exec(block);
  let next: string;
  if (co) {
    const coOpen = co.index + co[0].length - 1;
    const coClose = matchBrace(block, coOpen);
    next = coClose < 0 ? block : block.slice(0, co.index) + cfg + block.slice(coClose + 1);
  } else {
    next = block.replace(/^\{/, `{ ${cfg},`);
  }
  return text.slice(0, b.open) + next + text.slice(b.close + 1);
}

// ── modinfo.lua schema (heuristic) ────────────────────────────────────────

/** คืนช่วง [open,close] ของ table ลูกแต่ละตัวที่อยู่ระดับบนสุดใน { } ที่ arrayOpen */
function childTables(text: string, arrayOpen: number, arrayClose: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let inStr: string | null = null;
  for (let i = arrayOpen + 1; i < arrayClose; i++) {
    const c = text[i]!;
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === "{") {
      const close = matchBrace(text, i);
      if (close < 0 || close > arrayClose) break;
      out.push([i, close]);
      i = close;
    }
  }
  return out;
}

function field(block: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(true|false|-?\\d+\\.?\\d*|"(?:[^"\\\\]|\\\\.)*")`).exec(block);
  return m?.[1] ?? null;
}

/**
 * parse configuration_options จาก modinfo.lua (รูปแบบมาตรฐานของ DST)
 * คืน [] ถ้า parse ไม่ได้/ไม่มี/ไม่เป็นรูปแบบที่รองรับ → caller ให้ไปใช้ raw editor
 */
export function parseModInfoSchema(modinfo: string): ModConfigOption[] {
  try {
    const co = /configuration_options\s*=\s*\{/.exec(modinfo);
    if (!co) return [];
    const arrOpen = co.index + co[0].length - 1;
    const arrClose = matchBrace(modinfo, arrOpen);
    if (arrClose < 0) return [];

    const result: ModConfigOption[] = [];
    for (const [s, e] of childTables(modinfo, arrOpen, arrClose)) {
      const optBlock = modinfo.slice(s, e + 1);
      const nameRaw = field(optBlock, "name");
      if (!nameRaw || !nameRaw.startsWith('"')) continue; // ต้องมี name เป็น string
      const name = parseLuaValue(nameRaw) as string;

      // options = { {description=..,data=..}, ... }
      const optsM = /\boptions\s*=\s*\{/.exec(optBlock);
      if (!optsM) continue;
      const oOpen = optsM.index + optsM[0].length - 1;
      const oClose = matchBrace(optBlock, oOpen);
      if (oClose < 0) continue;
      const choices: ModConfigChoice[] = [];
      for (const [cs, ce] of childTables(optBlock, oOpen, oClose)) {
        const cb = optBlock.slice(cs, ce + 1);
        const descRaw = field(cb, "description");
        const dataRaw = field(cb, "data");
        if (dataRaw === null) continue;
        choices.push({
          description: descRaw && descRaw.startsWith('"') ? (parseLuaValue(descRaw) as string) : luaValue(parseLuaValue(dataRaw)),
          data: parseLuaValue(dataRaw),
        });
      }
      if (choices.length === 0) continue; // ต้องมีตัวเลือกถึงจะทำ dropdown ได้

      const labelRaw = field(optBlock, "label");
      const defRaw = field(optBlock, "default");
      result.push({
        name,
        label: labelRaw && labelRaw.startsWith('"') ? (parseLuaValue(labelRaw) as string) : name,
        options: choices,
        default: defRaw !== null && VAL_RE.test(defRaw) ? parseLuaValue(defRaw) : null,
      });
    }
    return result;
  } catch {
    return [];
  }
}
