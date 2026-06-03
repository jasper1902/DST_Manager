import { readFile, writeFile } from "node:fs/promises";
import ini from "ini";
import type { DSTConfig } from "../config.js";
import { clusterIniPath } from "./paths.js";

/**
 * อ่าน/เขียน cluster.ini เฉพาะ key ที่ whitelist เท่านั้น
 * ห้ามเปิดให้แก้ key มั่ว ๆ ลงไฟล์ INI (กันพังหรือถูก inject)
 *
 * การแก้มีผลตอน restart server เท่านั้น (engine อ่าน INI ตอน boot)
 */

export type FieldType = "string" | "int" | "bool" | "enum";

export interface WhitelistField {
  /** key ที่ user พิมพ์ใน Discord (case-insensitive) */
  key: string;
  /** section ใน INI */
  section: string;
  /** key จริงใน INI */
  iniKey: string;
  type: FieldType;
  /** ค่าที่อนุญาต (เฉพาะ type=enum) */
  values?: string[];
  description: string;
}

/** whitelist — เพิ่ม/ลดได้ที่นี่ที่เดียว */
export const WHITELIST: readonly WhitelistField[] = [
  {
    key: "cluster_name",
    section: "NETWORK",
    iniKey: "cluster_name",
    type: "string",
    description: "ชื่อ server ที่โชว์ใน browser",
  },
  {
    key: "cluster_description",
    section: "NETWORK",
    iniKey: "cluster_description",
    type: "string",
    description: "คำอธิบาย server",
  },
  {
    key: "cluster_password",
    section: "NETWORK",
    iniKey: "cluster_password",
    type: "string",
    description: "รหัสผ่านเข้า server (เว้นว่าง = ไม่มี)",
  },
  {
    key: "cluster_intention",
    section: "NETWORK",
    iniKey: "cluster_intention",
    type: "enum",
    values: ["cooperative", "competitive", "social", "madness"],
    description: "ประเภท server",
  },
  {
    key: "game_mode",
    section: "GAMEPLAY",
    iniKey: "game_mode",
    type: "enum",
    values: ["survival", "endless", "wilderness"],
    description: "โหมดเกม",
  },
  {
    key: "max_players",
    section: "GAMEPLAY",
    iniKey: "max_players",
    type: "int",
    description: "จำนวนผู้เล่นสูงสุด",
  },
  {
    key: "pvp",
    section: "GAMEPLAY",
    iniKey: "pvp",
    type: "bool",
    description: "เปิด PvP หรือไม่ (true/false)",
  },
  {
    key: "pause_when_empty",
    section: "GAMEPLAY",
    iniKey: "pause_when_empty",
    type: "bool",
    description: "หยุดเวลาเมื่อไม่มีผู้เล่น (true/false)",
  },
] as const;

export interface ConfigValue {
  key: string;
  value: string;
  description: string;
}

function findField(key: string): WhitelistField | undefined {
  const lower = key.toLowerCase();
  return WHITELIST.find((f) => f.key.toLowerCase() === lower);
}

/** ตรวจ + normalize ค่าตาม type; throw ถ้าไม่ผ่าน */
function validateValue(field: WhitelistField, raw: string): string {
  const value = raw.trim();
  switch (field.type) {
    case "int": {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || String(n) !== value) {
        throw new Error(`'${field.key}' ต้องเป็นจำนวนเต็ม`);
      }
      return String(n);
    }
    case "bool": {
      const lower = value.toLowerCase();
      if (lower === "true" || lower === "false") return lower;
      throw new Error(`'${field.key}' ต้องเป็น true หรือ false`);
    }
    case "enum": {
      const allowed = field.values ?? [];
      if (!allowed.includes(value)) {
        throw new Error(`'${field.key}' ต้องเป็นหนึ่งใน: ${allowed.join(", ")}`);
      }
      return value;
    }
    case "string":
      // กัน newline ไป break รูปแบบ INI
      return value.replace(/[\r\n]/g, " ");
  }
}

type IniData = Record<string, Record<string, unknown>>;

async function readIni(dst: DSTConfig): Promise<IniData> {
  const path = clusterIniPath(dst);
  const text = await readFile(path, "utf8");
  return ini.parse(text) as IniData;
}

/** คืนค่าปัจจุบันของทุก key ที่ whitelist (key ที่ไม่มีในไฟล์ = "(unset)") */
export async function showConfig(dst: DSTConfig): Promise<ConfigValue[]> {
  const data = await readIni(dst);
  return WHITELIST.map((field) => {
    const section = data[field.section];
    const raw = section?.[field.iniKey];
    return {
      key: field.key,
      value: raw === undefined || raw === "" ? "(unset)" : String(raw),
      description: field.description,
    };
  });
}

/**
 * set ค่า key (ต้องอยู่ใน whitelist) แล้วเขียนกลับไฟล์
 * คืนค่าที่ normalize แล้ว เพื่อให้ caller ยืนยันกับ user
 */
export async function setConfig(
  dst: DSTConfig,
  key: string,
  rawValue: string,
): Promise<{ key: string; value: string }> {
  const field = findField(key);
  if (!field) {
    const allowed = WHITELIST.map((f) => f.key).join(", ");
    throw new Error(`key '${key}' ไม่อยู่ใน whitelist; แก้ได้เฉพาะ: ${allowed}`);
  }
  const value = validateValue(field, rawValue);

  const data = await readIni(dst);
  const section = (data[field.section] ??= {});
  section[field.iniKey] = value;

  await writeFile(clusterIniPath(dst), ini.stringify(data), "utf8");
  return { key: field.key, value };
}

/** ชื่อ key ทั้งหมดที่ตั้งได้ (ไว้ทำ choices ของ slash command) */
export function whitelistedKeys(): WhitelistField[] {
  return [...WHITELIST];
}
