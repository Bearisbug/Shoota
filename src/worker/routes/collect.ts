// API-001 匿名统计上报与 API-005 合并旅客编号，校验顺序、状态码与写库逐条沿用旧版 src/worker.js。
// 合并的 INSERT … SELECT 原样沿用旧版 SQL，直接走 D1 批处理。
import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { BatchItem } from 'drizzle-orm/batch';
import type { CollectType } from '../../shared/api';
import type { AppEnv } from '../env';
import { gameDays, visitorDays, visitors } from '../db/schema';
import { GAME_ID, HEX32, bjDay, country, isInt, isObj, isStaff, noContent, problem, readJson } from '../http';

const EVENT_TYPES = new Set<unknown>(['visit', 'start', 'play', 'backup', 'restore'] satisfies CollectType[]);
const MAX_EVENTS = 20, MAX_BODY_BYTES = 8192, MAX_SECONDS = 300;

/* ───────── API-001 上报 ───────── */
// 整批校验，任一事件不合法就整批拒绝；一次请求的游玩秒数合计不超过 300（INV-001）
function parseBatch(b: unknown) {
  if (!isObj(b) || typeof b.v !== 'string' || !HEX32.test(b.v)) return null;
  if (!Array.isArray(b.ev) || b.ev.length < 1 || b.ev.length > MAX_EVENTS) return null;
  const day = { visits: 0, seconds: 0, backups: 0, restores: 0 }, games = new Map<string, { starts: number; seconds: number }>();
  for (const e of b.ev as unknown[]) {
    if (!isObj(e) || !EVENT_TYPES.has(e.t)) return null;
    if (e.t === 'start' || e.t === 'play') {
      if (typeof e.g !== 'string' || !GAME_ID.test(e.g)) return null;
      const g = games.get(e.g) || { starts: 0, seconds: 0 };
      games.set(e.g, g);
      if (e.t === 'start') g.starts++;
      else {
        if (!isInt(e.s, 1, MAX_SECONDS)) return null;
        g.seconds += e.s; day.seconds += e.s;
      }
    } else if (e.t === 'visit') day.visits++;
    else if (e.t === 'backup') day.backups++;
    else day.restores++;
  }
  if (day.seconds > MAX_SECONDS) return null;
  return { vid: b.v, prior: b.o === 1 ? 1 : 0, day, games };
}

export async function collect(c: Context<AppEnv>) {
  const req = c.req.raw;
  const p = parseBatch(await readJson(req, MAX_BODY_BYTES));
  if (!p) return problem(req, 400, '/errors/bad-event', '上报格式不对');
  if (isStaff(req)) return noContent(); // 内部浏览器不计入（INV-002）

  const today = bjDay(), ua = req.headers.get('user-agent') || '';
  const device = /Mobi|Android|iPhone|iPad|HarmonyOS/i.test(ua) ? 'mobile' : 'desktop';
  const wechat = /MicroMessenger/i.test(ua) ? 1 : 0;
  const db = drizzle(c.env.DB), d = p.day;
  const stmts: BatchItem<'sqlite'>[] = [
    db.insert(visitors).values({ vid: p.vid, firstDay: today, device, wechat, country: country(req), prior: p.prior }).onConflictDoNothing(),
    db.insert(visitorDays).values({ vid: p.vid, day: today, ...d }).onConflictDoUpdate({
      target: [visitorDays.vid, visitorDays.day],
      set: {
        visits: sql`${visitorDays.visits} + excluded.visits`, seconds: sql`${visitorDays.seconds} + excluded.seconds`,
        backups: sql`${visitorDays.backups} + excluded.backups`, restores: sql`${visitorDays.restores} + excluded.restores`,
      },
    }),
  ];
  for (const [game, g] of p.games) {
    stmts.push(db.insert(gameDays).values({ vid: p.vid, game, day: today, ...g }).onConflictDoUpdate({
      target: [gameDays.vid, gameDays.game, gameDays.day],
      set: { starts: sql`${gameDays.starts} + excluded.starts`, seconds: sql`${gameDays.seconds} + excluded.seconds` },
    }));
  }
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return noContent();
}

/* ───────── API-005 合并旅客编号：存档搬到 https 后，https 下新领的编号并进 http 下的旧编号 ───────── */
// 在一个批处理里完成，重发或两个标签页同时合并时 from 已经没有行，什么都不改（INV-005）
export async function merge(c: Context<AppEnv>) {
  const req = c.req.raw;
  const b = await readJson(req, MAX_BODY_BYTES);
  const id = (v: unknown): v is string => typeof v === 'string' && HEX32.test(v);
  if (!isObj(b) || !id(b.v) || !id(b.from) || b.v === b.from) return problem(req, 400, '/errors/bad-merge', '合并请求的编号格式不对');
  if (isStaff(req)) return noContent(); // 内部浏览器不计入（INV-002）

  const q = (query: string, ...args: unknown[]) => c.env.DB.prepare(query).bind(...args);
  await c.env.DB.batch([
    q(`INSERT OR IGNORE INTO visitors (vid, first_day, device, wechat, country, prior)
      SELECT ?1, first_day, device, wechat, country, prior FROM visitors WHERE vid = ?2`, b.v, b.from),
    q(`INSERT INTO visitor_days (vid, day, visits, seconds, backups, restores)
      SELECT ?1, day, visits, seconds, backups, restores FROM visitor_days WHERE vid = ?2
      ON CONFLICT (vid, day) DO UPDATE SET visits = visits + excluded.visits, seconds = seconds + excluded.seconds,
        backups = backups + excluded.backups, restores = restores + excluded.restores`, b.v, b.from),
    q(`INSERT INTO game_days (vid, game, day, starts, seconds)
      SELECT ?1, game, day, starts, seconds FROM game_days WHERE vid = ?2
      ON CONFLICT (vid, game, day) DO UPDATE SET starts = starts + excluded.starts, seconds = seconds + excluded.seconds`, b.v, b.from),
    q('DELETE FROM visitors WHERE vid = ?', b.from),
    q('DELETE FROM visitor_days WHERE vid = ?', b.from),
    q('DELETE FROM game_days WHERE vid = ?', b.from)
  ]);
  return noContent();
}
