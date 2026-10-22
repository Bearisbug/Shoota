// 各路由共用：北京日期、错误信封、cookie 解析、摘要。逐条沿用旧版 src/worker.js（dd731d6）。
import type { ErrorType } from '../shared/api';

export const DAY_MS = 86400000;
export const bjDay = (ms = Date.now()) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
export const bjTime = (ms: number) => new Date(ms + 8 * 3600000).toISOString().slice(11, 16);
export const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);

export const HEX32 = /^[0-9a-f]{32}$/; // 旅客编号、云存档编号
export const GAME_ID = /^[a-z0-9-]{1,32}$/;

export const enc = new TextEncoder();

// 错误信封 application/problem+json，instance 用 cf-ray 作排障关联（§14）
export function problem(req: Request, status: number, type: ErrorType, title: string) {
  return new Response(JSON.stringify({ type, title, status, instance: req.headers.get('cf-ray') || '' }), {
    status, headers: { 'content-type': 'application/problem+json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export const noContent = () => new Response(null, { status: 204 });

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export function cookies(req: Request) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// 登录过看板的浏览器带 sk_staff=1，它的上报一律不写统计表（INV-002）
export const isStaff = (req: Request) => cookies(req).sk_staff === '1';

// 正文超过上限或不是 JSON 时返回 undefined
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const raw = await req.arrayBuffer();
  if (raw.byteLength > maxBytes) return undefined;
  try { return JSON.parse(new TextDecoder().decode(raw)); } catch { return undefined; }
}

export function country(req: Request) {
  const cc = req.cf?.country;
  return typeof cc === 'string' && /^[A-Z]{2}$/.test(cc) ? cc : 'XX';
}

export async function sha256(text: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
export const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
