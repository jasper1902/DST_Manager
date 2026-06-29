import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { DSTConfig } from "../config.js";
import { clusterDir, clusterTokenPath } from "./paths.js";

/**
 * จัดการ cluster_token.txt — server token จาก Klei (https://accounts.klei.com)
 * DST dedicated server ต้องมีไฟล์นี้ใน cluster ถึงจะเชื่อม Klei / ขึ้น browser ได้
 * ไม่มีไฟล์นี้ → server start ไม่ได้
 *
 * ไฟล์เก็บ token ดิบบรรทัดเดียว (เคียงข้าง cluster.ini ใน cluster dir)
 */

/** อ่าน token (trim); คืน null ถ้าไม่มีไฟล์/อ่านไม่ได้ */
export function readClusterToken(dst: DSTConfig): string | null {
  try {
    const path = clusterTokenPath(dst);
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

/** มี token ใช้งานได้ไหม (ไฟล์มีอยู่ + ไม่ว่าง) */
export function hasClusterToken(dst: DSTConfig): boolean {
  const token = readClusterToken(dst);
  return token !== null && token !== "";
}

/**
 * เขียน/อัปเดต cluster_token.txt (สร้าง cluster dir ให้ถ้ายังไม่มี)
 * throw ถ้า token ว่าง — กันเขียนไฟล์เปล่าที่ทำ start พังเงียบ ๆ
 */
export function writeClusterToken(dst: DSTConfig, token: string): void {
  const value = token.trim();
  if (value === "") throw new Error("cluster_token ว่าง — ใส่ token จาก https://accounts.klei.com");
  mkdirSync(clusterDir(dst), { recursive: true });
  writeFileSync(clusterTokenPath(dst), `${value}\n`, "utf8");
}
