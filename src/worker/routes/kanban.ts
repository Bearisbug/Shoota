// API-002 看板页面、API-003 登录、API-004 看板数据。会话与内部标记 cookie、登录防护、五块统计口径逐条沿用旧版 src/worker.js；
// 页面改由静态资源 kanban/index.html 与 kanban/login.html 提供，验过会话才从 ASSETS 取出（§6）。
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { KanbanData, KanbanLaunch, LaunchCounts } from '../../shared/api';
import type { RunEnv } from '../../shared/protocol';
import type { LaunchFailReason } from '../../shared/telemetry';
import { GAME_TITLES } from '../../catalog';
import type { AppEnv, Env } from '../env';
import { loginGuards } from '../db/schema';
import { DAY_MS, addDays, bjDay, bjTime, cookies, enc, hex, json, problem, sha256 } from '../http';

const SESSION_DAYS = 7, STAFF_DAYS = 365, MAX_FAILS = 5, LOCK_MS = 15 * 60000;
const STATS_START = '2026-10-20'; // 统计首日
const PRIOR_SINCE = '2026-10-21'; // 老玩家识别上线当天；统计首日到这天首访的新旅客含没被认出的老玩家
const NOT_CONFIGURED = '看板还没配置密码，请联系管理员。';
const lockedMsg = (until: number) => `这个网络连续输错了 ${MAX_FAILS} 次，已锁定。北京时间 ${bjTime(until)} 之后再试。`;

const configured = (env: Env) => Boolean(env.KANBAN_PASSWORD && env.KANBAN_SECRET);
function sameBytes(a: Uint8Array, b: Uint8Array) { return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b); }
async function hmac(env: Env, text: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.KANBAN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}

async function sessionOk(req: Request, env: Env) {
  if (!configured(env)) return false;
  const [exp, sig] = (cookies(req).sk_session || '').split('.');
  if (!/^\d+$/.test(exp || '') || Number(exp) < Date.now() || !sig) return false;
  return sameBytes(enc.encode(sig), enc.encode(await hmac(env, 'kanban-session:' + exp)));
}

// 静态资源按默认的 html 路径规则取：/kanban/ 是 kanban/index.html，/kanban/login 是 kanban/login.html
async function asset(env: Env, req: Request, path: string) {
  const res = await env.ASSETS.fetch(new URL(path, req.url));
  if (!res.ok) throw new Error(`静态资源 ${path} 返回 ${res.status}`);
  return res;
}

const htmlHeaders = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };

// 提示文字填进页内占位 <!--MSG-->；有提示时把密码框的 aria-invalid="false" 改成 true
async function loginPage(env: Env, req: Request, status: number, message: string) {
  let html = (await (await asset(env, req, '/kanban/login')).text()).replace('<!--MSG-->', message);
  if (message) html = html.replace('aria-invalid="false"', 'aria-invalid="true"');
  return new Response(html, { status, headers: htmlHeaders });
}

const notLoggedIn = (env: Env, req: Request) => loginPage(env, req, 200, configured(env) ? '' : NOT_CONFIGURED);

export async function kanbanPage(c: Context<AppEnv>) {
  const req = c.req.raw;
  if (!(await sessionOk(req, c.env))) return notLoggedIn(c.env, req);
  return new Response((await asset(c.env, req, '/kanban/')).body, { headers: htmlHeaders });
}

// /kanban/ 下其余地址同样先验会话，未登录一律给登录页
export async function kanbanAsset(c: Context<AppEnv>) {
  const req = c.req.raw;
  if (!(await sessionOk(req, c.env))) return notLoggedIn(c.env, req);
  const res = await c.env.ASSETS.fetch(req), out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-store');
  return out;
}

// 登录防护状态机见 docs/DESIGN.md §11：连错 5 次锁 15 分钟，锁定期内不比对密码
export async function login(c: Context<AppEnv>) {
  const req = c.req.raw, env = c.env;
  if (!configured(env)) return loginPage(env, req, 503, NOT_CONFIGURED);
  const form = await req.formData().catch(() => null);
  const password = String(form?.get('password') ?? '');
  const ipHash = hex(await sha256(env.KANBAN_SECRET + '|' + (req.headers.get('cf-connecting-ip') || 'local'))).slice(0, 32);
  const now = Date.now(), db = drizzle(env.DB);
  const guard = await db.select({ lockedUntil: loginGuards.lockedUntil }).from(loginGuards).where(eq(loginGuards.ipHash, ipHash)).get();
  if (guard?.lockedUntil && now < guard.lockedUntil) return loginPage(env, req, 429, lockedMsg(guard.lockedUntil));
  if (sameBytes(await sha256(password), await sha256(env.KANBAN_PASSWORD!))) {
    if (guard) await db.delete(loginGuards).where(eq(loginGuards.ipHash, ipHash)).run();
    const exp = now + SESSION_DAYS * DAY_MS;
    const headers = new Headers({ location: '/kanban', 'cache-control': 'no-store' });
    headers.append('set-cookie', `sk_session=${exp}.${await hmac(env, 'kanban-session:' + exp)}; Path=/kanban; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
    headers.append('set-cookie', `sk_staff=1; Path=/; Max-Age=${STAFF_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null, { status: 303, headers });
  }
  // 一条语句完成累加与锁定，并发的错误提交也逐次累加；上次锁定已过期时从 1 重新计
  const row = (await env.DB.prepare(`INSERT INTO login_guards (ip_hash, fails, locked_until) VALUES (?1, 1, NULL)
    ON CONFLICT (ip_hash) DO UPDATE SET
      fails = CASE WHEN locked_until IS NOT NULL AND locked_until <= ?2 THEN 1 ELSE fails + 1 END,
      locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= ?2 THEN 1 ELSE fails + 1 END) >= ?3 THEN ?4 ELSE NULL END
    RETURNING fails, locked_until`).bind(ipHash, now, MAX_FAILS, now + LOCK_MS).first<{ fails: number; locked_until: number | null }>())!;
  if (row.locked_until) return loginPage(env, req, 429, lockedMsg(row.locked_until));
  return loginPage(env, req, 401, `密码不对，还能试 ${MAX_FAILS - row.fails} 次。连错 ${MAX_FAILS} 次会锁定 15 分钟。`);
}

/* ───────── API-004 看板数据 ───────── */
// 五块的 SQL 原样沿用旧版；启动块是新增的第六块，近 7 天
const LAUNCH_COLS = `COALESCE(SUM(starts), 0) starts, COALESCE(SUM(ready), 0) ready, COALESCE(SUM(fail), 0) fail, COALESCE(SUM(cancel), 0) cancel,
  COALESCE(SUM(b1), 0) b1, COALESCE(SUM(b3), 0) b3, COALESCE(SUM(b10), 0) b10, COALESCE(SUM(b30), 0) b30, COALESCE(SUM(bx), 0) bx,
  COALESCE(SUM(fs_try), 0) fsTry, COALESCE(SUM(fs_ok), 0) fsOk`;

type N = number;
type Rows = [
  { a1: N; a7: N; a30: N; s1: N; s7: N; s30: N; b30: N; r30: N }[],
  { n1: N; n7: N; n30: N }[],
  { day: string; active: N; seconds: N }[],
  { day: string; n: N }[],
  { day: string; n: N; r1: N; r7: N; r30: N }[],
  { game: string; players: N; starts: N; seconds: N }[],
  { game: string; n: N; r: N }[],
  { device: string; wechat: N; country: string; n: N }[],
  LaunchCounts[],
  (LaunchCounts & { country: string })[],
  (LaunchCounts & { game: string })[],
  (LaunchCounts & { env: RunEnv })[],
  { country: string; reason: LaunchFailReason; n: N }[],
];

export async function kanbanData(c: Context<AppEnv>) {
  const req = c.req.raw, env = c.env;
  if (!(await sessionOk(req, env))) return problem(req, 401, '/errors/not-logged-in', '看板会话不存在或已过期');
  const today = bjDay(), d7 = addDays(today, -6), d30 = addDays(today, -29), d60 = addDays(today, -59);
  const q = (query: string, ...args: unknown[]) => env.DB.prepare(query).bind(...args);
  const [ov, nw, trendA, trendN, ret, games, gameRet, src, lTotal, lCountry, lGame, lEnv, lFails] = (await env.DB.batch([
    q(`SELECT COUNT(DISTINCT CASE WHEN day = ?1 THEN vid END) a1, COUNT(DISTINCT CASE WHEN day >= ?2 THEN vid END) a7, COUNT(DISTINCT vid) a30,
        COALESCE(SUM(CASE WHEN day = ?1 THEN seconds END), 0) s1, COALESCE(SUM(CASE WHEN day >= ?2 THEN seconds END), 0) s7, COALESCE(SUM(seconds), 0) s30,
        COALESCE(SUM(backups), 0) b30, COALESCE(SUM(restores), 0) r30
      FROM visitor_days WHERE day >= ?3`, today, d7, d30),
    q(`SELECT COALESCE(SUM(first_day = ?1), 0) n1, COALESCE(SUM(first_day >= ?2), 0) n7, COUNT(*) n30 FROM visitors WHERE first_day >= ?3 AND prior = 0`, today, d7, d30),
    q('SELECT day, COUNT(*) active, SUM(seconds) seconds FROM visitor_days WHERE day >= ? GROUP BY day', d30),
    q('SELECT first_day day, COUNT(*) n FROM visitors WHERE first_day >= ? AND prior = 0 GROUP BY first_day', d30),
    q(`SELECT v.first_day day, COUNT(*) n,
        SUM(EXISTS (SELECT 1 FROM visitor_days d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+1 day'))) r1,
        SUM(EXISTS (SELECT 1 FROM visitor_days d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+7 day'))) r7,
        SUM(EXISTS (SELECT 1 FROM visitor_days d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+30 day'))) r30
      FROM visitors v WHERE v.first_day >= ? AND v.prior = 0 GROUP BY v.first_day ORDER BY v.first_day DESC`, d60),
    q('SELECT game, COUNT(DISTINCT vid) players, SUM(starts) starts, SUM(seconds) seconds FROM game_days WHERE day >= ? GROUP BY game ORDER BY seconds DESC, players DESC', d30),
    q(`WITH f AS (SELECT vid, game, MIN(day) fd FROM game_days GROUP BY vid, game)
      SELECT f.game, COUNT(*) n, SUM(EXISTS (SELECT 1 FROM game_days g WHERE g.vid = f.vid AND g.game = f.game AND g.day = date(f.fd, '+1 day'))) r
      FROM f WHERE f.fd >= ? AND f.fd < ? GROUP BY f.game`, d30, today),
    q(`SELECT device, wechat, country, COUNT(*) n FROM visitors
      WHERE vid IN (SELECT DISTINCT vid FROM visitor_days WHERE day >= ?) GROUP BY device, wechat, country`, d30),
    q(`SELECT ${LAUNCH_COLS} FROM launch_days WHERE day >= ?`, d7),
    q(`SELECT country, ${LAUNCH_COLS} FROM launch_days WHERE day >= ? GROUP BY country ORDER BY starts DESC, country LIMIT 10`, d7),
    q(`SELECT game, ${LAUNCH_COLS} FROM launch_days WHERE day >= ? GROUP BY game ORDER BY starts DESC, game`, d7),
    q(`SELECT env, ${LAUNCH_COLS} FROM launch_days WHERE day >= ? GROUP BY env ORDER BY starts DESC, env`, d7),
    q('SELECT country, reason, SUM(n) n FROM launch_fails WHERE day >= ? GROUP BY country, reason ORDER BY n DESC, country, reason', d7)
  ])).map(r => r.results) as Rows;

  const o = ov[0], n = nw[0];
  const byDay = new Map(trendA.map(r => [r.day, r])), newByDay = new Map(trendN.map(r => [r.day, r.n]));
  const trend: KanbanData['trend'] = [];
  for (let i = 29; i >= 0; i--) {
    const day = addDays(today, -i);
    trend.push({ day, active: byDay.get(day)?.active || 0, new: newByDay.get(day) || 0, seconds: byDay.get(day)?.seconds || 0 });
  }
  const ripe = (day: string, k: number) => addDays(day, k) <= today; // 第 k 天还没到时留存为空
  const retention = ret.map(r => ({ day: r.day, n: r.n, r1: ripe(r.day, 1) ? r.r1 : null, r7: ripe(r.day, 7) ? r.r7 : null, r30: ripe(r.day, 30) ? r.r30 : null }));
  const nextDay = new Map(gameRet.map(r => [r.game, r]));
  const sources = { total: 0, wechat: 0, mobile: 0, desktop: 0 }, countries: Record<string, number> = {};
  for (const r of src) {
    sources.total += r.n;
    if (r.wechat) sources.wechat += r.n;
    sources[r.device === 'mobile' ? 'mobile' : 'desktop'] += r.n;
    countries[r.country] = (countries[r.country] || 0) + r.n;
  }
  const launch: KanbanLaunch = {
    from: d7, total: lTotal[0], byCountry: lCountry,
    byGame: lGame.map(({ game, ...r }) => ({ id: game, title: GAME_TITLES[game] || game, ...r })),
    byEnv: lEnv, reasons: lFails,
  };

  const data: KanbanData = {
    today, statsStart: STATS_START, priorSince: PRIOR_SINCE, generatedAt: Date.now(),
    overview: {
      today: { active: o.a1, new: n.n1, seconds: o.s1 },
      d7: { active: o.a7, new: n.n7, seconds: o.s7 },
      d30: { active: o.a30, new: n.n30, seconds: o.s30 },
      backups30: o.b30, restores30: o.r30
    },
    trend, retention,
    games: games.map(g => ({ id: g.game, title: GAME_TITLES[g.game] || g.game, players: g.players, starts: g.starts, seconds: g.seconds,
      nextDay: { n: nextDay.get(g.game)?.n || 0, r: nextDay.get(g.game)?.r || 0 } })),
    sources: { ...sources, countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, n: count })) },
    launch,
  };
  return json(data);
}
