// shoota Worker：匿名统计上报（/api/e）与密码看板（/kanban）。
// 只有 wrangler.jsonc 里 run_worker_first 列出的路径会进这里，其余请求由静态资源直接返回。
// 接口、口径与错误码见 docs/DESIGN.md §8、§9、§14。
import DASHBOARD_HTML from './kanban.html';

const DAY_MS = 86400000;
const EVENT_TYPES = new Set(['visit', 'start', 'play', 'backup', 'restore']);
const MAX_EVENTS = 20, MAX_BODY_BYTES = 8192, MAX_SECONDS = 300;
const SESSION_DAYS = 7, STAFF_DAYS = 365, MAX_FAILS = 5, LOCK_MS = 15 * 60000;

const bjDay = (ms = Date.now()) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
const bjTime = ms => new Date(ms + 8 * 3600000).toISOString().slice(11, 16);
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const enc = new TextEncoder();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/e' && req.method === 'POST') return collect(req, env);
    if (url.pathname === '/kanban' && req.method === 'GET') return kanbanPage(req, env);
    if (url.pathname === '/kanban/login' && req.method === 'POST') return login(req, env);
    if (url.pathname === '/kanban/data' && req.method === 'GET') return kanbanData(req, env);
    return env.ASSETS.fetch(req);
  }
};

/* ───────── 公共 ───────── */
function problem(req, status, type, title) {
  return new Response(JSON.stringify({ type, title, status, instance: req.headers.get('cf-ray') || '' }), {
    status, headers: { 'content-type': 'application/problem+json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
async function sha256(text) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.KANBAN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}
function sameBytes(a, b) { return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b); }
const configured = env => Boolean(env.KANBAN_PASSWORD && env.KANBAN_SECRET);

/* ───────── API-001 上报 ───────── */
// 整批校验，任一事件不合法就整批拒绝；一次请求的游玩秒数合计不超过 300（INV-001）
function parseBatch(b) {
  if (!b || typeof b.v !== 'string' || !/^[0-9a-f]{32}$/.test(b.v)) return null;
  if (!Array.isArray(b.ev) || b.ev.length < 1 || b.ev.length > MAX_EVENTS) return null;
  const day = { visits: 0, seconds: 0, backups: 0, restores: 0 }, games = new Map();
  for (const e of b.ev) {
    if (!e || !EVENT_TYPES.has(e.t)) return null;
    if (e.t === 'start' || e.t === 'play') {
      if (typeof e.g !== 'string' || !/^[a-z0-9-]{1,32}$/.test(e.g)) return null;
      const g = games.get(e.g) || { starts: 0, seconds: 0 };
      games.set(e.g, g);
      if (e.t === 'start') g.starts++;
      else {
        if (!Number.isInteger(e.s) || e.s < 1 || e.s > MAX_SECONDS) return null;
        g.seconds += e.s; day.seconds += e.s;
      }
    } else if (e.t === 'visit') day.visits++;
    else if (e.t === 'backup') day.backups++;
    else day.restores++;
  }
  if (day.seconds > MAX_SECONDS) return null;
  return { vid: b.v, day, games };
}

async function collect(req, env) {
  const bad = () => problem(req, 400, '/errors/bad-event', '上报格式不对');
  const raw = await req.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) return bad();
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return bad(); }
  const p = parseBatch(body);
  if (!p) return bad();
  if (cookies(req).sk_staff === '1') return new Response(null, { status: 204 }); // 内部浏览器不计入（INV-002）

  const today = bjDay(), ua = req.headers.get('user-agent') || '', cc = req.cf?.country;
  const device = /Mobi|Android|iPhone|iPad|HarmonyOS/i.test(ua) ? 'mobile' : 'desktop';
  const wechat = /MicroMessenger/i.test(ua) ? 1 : 0;
  const country = typeof cc === 'string' && /^[A-Z]{2}$/.test(cc) ? cc : 'XX';
  const d = p.day;
  const stmts = [
    env.DB.prepare('INSERT OR IGNORE INTO visitors (vid, first_day, device, wechat, country) VALUES (?, ?, ?, ?, ?)')
      .bind(p.vid, today, device, wechat, country),
    env.DB.prepare(`INSERT INTO visitor_days (vid, day, visits, seconds, backups, restores) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (vid, day) DO UPDATE SET visits = visits + excluded.visits, seconds = seconds + excluded.seconds,
        backups = backups + excluded.backups, restores = restores + excluded.restores`)
      .bind(p.vid, today, d.visits, d.seconds, d.backups, d.restores)
  ];
  for (const [game, g] of p.games) {
    stmts.push(env.DB.prepare(`INSERT INTO game_days (vid, game, day, starts, seconds) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (vid, game, day) DO UPDATE SET starts = starts + excluded.starts, seconds = seconds + excluded.seconds`)
      .bind(p.vid, game, today, g.starts, g.seconds));
  }
  await env.DB.batch(stmts);
  return new Response(null, { status: 204 });
}

/* ───────── API-002 / API-003 看板页面与登录 ───────── */
async function sessionOk(req, env) {
  if (!configured(env)) return false;
  const [exp, sig] = (cookies(req).sk_session || '').split('.');
  if (!/^\d+$/.test(exp || '') || Number(exp) < Date.now() || !sig) return false;
  return sameBytes(enc.encode(sig), enc.encode(await hmac(env, 'kanban-session:' + exp)));
}

function loginPage(status, message) {
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>shoota 看板 · 登录</title>
<style>
:root{--bg:#10151c;--panel:#18202a;--line:#2a3644;--fg:#e4ebf2;--muted:#8c9aaa;--accent:#3ddc97;--accent-ink:#052618;--red:#e5636a;color-scheme:dark}
*{box-sizing:border-box}html{scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
body{margin:0;min-height:100svh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.6 "PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;padding:24px}
form{width:min(100%,380px);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:28px;display:grid;gap:14px}
h1{margin:0;font-size:22px}p{margin:0;color:var(--muted);font-size:14px}
label{font-size:13px;color:var(--muted)}
input{width:100%;font:inherit;font-size:16px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px 12px}
input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input[aria-invalid="true"]{border-color:var(--red)}
.err{color:var(--red);min-height:1.6em}
button{font:inherit;font-weight:700;border:0;border-radius:6px;padding:11px;background:var(--accent);color:var(--accent-ink);cursor:pointer}
button:hover{filter:brightness(1.08)}
</style></head><body>
<form method="post" action="/kanban/login">
  <h1>shoota 看板</h1>
  <p>输入看板密码。登录后这个浏览器之后的游玩不计入统计。</p>
  <label for="pw">密码</label>
  <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus aria-describedby="err"${message ? ' aria-invalid="true"' : ''}>
  <p class="err" id="err" role="alert">${message || ''}</p>
  <button type="submit">进入看板</button>
</form></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function kanbanPage(req, env) {
  if (!(await sessionOk(req, env))) return loginPage(200, configured(env) ? '' : '看板还没配置密码，请联系管理员。');
  return new Response(DASHBOARD_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// 登录防护状态机见 docs/DESIGN.md §11：连错 5 次锁 15 分钟，锁定期内不比对密码
async function login(req, env) {
  if (!configured(env)) return loginPage(503, '看板还没配置密码，请联系管理员。');
  const form = await req.formData().catch(() => null);
  const password = String(form?.get('password') ?? '');
  const ipHash = hex(await sha256(env.KANBAN_SECRET + '|' + (req.headers.get('cf-connecting-ip') || 'local'))).slice(0, 32);
  const now = Date.now();
  const guard = await env.DB.prepare('SELECT fails, locked_until FROM login_guards WHERE ip_hash = ?').bind(ipHash).first();
  if (guard?.locked_until && now < guard.locked_until) {
    return loginPage(429, `这个网络连续输错了 ${MAX_FAILS} 次，已锁定。北京时间 ${bjTime(guard.locked_until)} 之后再试。`);
  }
  if (sameBytes(await sha256(password), await sha256(env.KANBAN_PASSWORD))) {
    if (guard) await env.DB.prepare('DELETE FROM login_guards WHERE ip_hash = ?').bind(ipHash).run();
    const exp = now + SESSION_DAYS * DAY_MS;
    const headers = new Headers({ location: '/kanban', 'cache-control': 'no-store' });
    headers.append('set-cookie', `sk_session=${exp}.${await hmac(env, 'kanban-session:' + exp)}; Path=/kanban; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
    headers.append('set-cookie', `sk_staff=1; Path=/; Max-Age=${STAFF_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null, { status: 303, headers });
  }
  // 一条语句完成累加与锁定，并发的错误提交也逐次累加；上次锁定已过期时从 1 重新计
  const row = await env.DB.prepare(`INSERT INTO login_guards (ip_hash, fails, locked_until) VALUES (?1, 1, NULL)
    ON CONFLICT (ip_hash) DO UPDATE SET
      fails = CASE WHEN locked_until IS NOT NULL AND locked_until <= ?2 THEN 1 ELSE fails + 1 END,
      locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= ?2 THEN 1 ELSE fails + 1 END) >= ?3 THEN ?4 ELSE NULL END
    RETURNING fails, locked_until`).bind(ipHash, now, MAX_FAILS, now + LOCK_MS).first();
  if (row.locked_until) return loginPage(429, `这个网络连续输错了 ${MAX_FAILS} 次，已锁定。北京时间 ${bjTime(row.locked_until)} 之后再试。`);
  return loginPage(401, `密码不对，还能试 ${MAX_FAILS - row.fails} 次。连错 ${MAX_FAILS} 次会锁定 15 分钟。`);
}

/* ───────── API-004 看板数据 ───────── */
async function kanbanData(req, env) {
  if (!(await sessionOk(req, env))) return problem(req, 401, '/errors/not-logged-in', '看板会话不存在或已过期');
  const today = bjDay(), d7 = addDays(today, -6), d30 = addDays(today, -29), d60 = addDays(today, -59);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [ov, nw, trendA, trendN, ret, games, gameRet, src] = (await env.DB.batch([
    q(`SELECT COUNT(DISTINCT CASE WHEN day = ?1 THEN vid END) a1, COUNT(DISTINCT CASE WHEN day >= ?2 THEN vid END) a7, COUNT(DISTINCT vid) a30,
        COALESCE(SUM(CASE WHEN day = ?1 THEN seconds END), 0) s1, COALESCE(SUM(CASE WHEN day >= ?2 THEN seconds END), 0) s7, COALESCE(SUM(seconds), 0) s30,
        COALESCE(SUM(backups), 0) b30, COALESCE(SUM(restores), 0) r30
      FROM visitor_days WHERE day >= ?3`, today, d7, d30),
    q(`SELECT COALESCE(SUM(first_day = ?1), 0) n1, COALESCE(SUM(first_day >= ?2), 0) n7, COUNT(*) n30 FROM visitors WHERE first_day >= ?3`, today, d7, d30),
    q('SELECT day, COUNT(*) active, SUM(seconds) seconds FROM visitor_days WHERE day >= ? GROUP BY day', d30),
    q('SELECT first_day day, COUNT(*) n FROM visitors WHERE first_day >= ? GROUP BY first_day', d30),
    q(`SELECT v.first_day day, COUNT(*) n,
        SUM(EXISTS (SELECT 1 FROM visitor_days d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+1 day'))) r1,
        SUM(EXISTS (SELECT 1 FROM visitor_days d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+7 day'))) r7,
        SUM(EXISTS (SELECT 1 FROM visitor_days d WHERE d.vid = v.vid AND d.day = date(v.first_day, '+30 day'))) r30
      FROM visitors v WHERE v.first_day >= ? GROUP BY v.first_day ORDER BY v.first_day DESC`, d60),
    q('SELECT game, COUNT(DISTINCT vid) players, SUM(starts) starts, SUM(seconds) seconds FROM game_days WHERE day >= ? GROUP BY game ORDER BY seconds DESC, players DESC', d30),
    q(`WITH f AS (SELECT vid, game, MIN(day) fd FROM game_days GROUP BY vid, game)
      SELECT f.game, COUNT(*) n, SUM(EXISTS (SELECT 1 FROM game_days g WHERE g.vid = f.vid AND g.game = f.game AND g.day = date(f.fd, '+1 day'))) r
      FROM f WHERE f.fd >= ? AND f.fd < ? GROUP BY f.game`, d30, today),
    q(`SELECT device, wechat, country, COUNT(*) n FROM visitors
      WHERE vid IN (SELECT DISTINCT vid FROM visitor_days WHERE day >= ?) GROUP BY device, wechat, country`, d30)
  ])).map(r => r.results);

  const o = ov[0], n = nw[0];
  const byDay = new Map(trendA.map(r => [r.day, r])), newByDay = new Map(trendN.map(r => [r.day, r.n]));
  const trend = [];
  for (let i = 29; i >= 0; i--) {
    const day = addDays(today, -i);
    trend.push({ day, active: byDay.get(day)?.active || 0, new: newByDay.get(day) || 0, seconds: byDay.get(day)?.seconds || 0 });
  }
  const ripe = (day, k) => addDays(day, k) <= today; // 第 k 天还没到时留存为空
  const retention = ret.map(r => ({ day: r.day, n: r.n, r1: ripe(r.day, 1) ? r.r1 : null, r7: ripe(r.day, 7) ? r.r7 : null, r30: ripe(r.day, 30) ? r.r30 : null }));
  const titles = await catalogTitles(req, env);
  const nextDay = new Map(gameRet.map(r => [r.game, r]));
  const sources = { total: 0, wechat: 0, mobile: 0, desktop: 0, countries: {} };
  for (const r of src) {
    sources.total += r.n;
    if (r.wechat) sources.wechat += r.n;
    sources[r.device === 'mobile' ? 'mobile' : 'desktop'] += r.n;
    sources.countries[r.country] = (sources.countries[r.country] || 0) + r.n;
  }
  sources.countries = Object.entries(sources.countries).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, n: count }));

  return new Response(JSON.stringify({
    today, generatedAt: Date.now(),
    overview: {
      today: { active: o.a1, new: n.n1, seconds: o.s1 },
      d7: { active: o.a7, new: n.n7, seconds: o.s7 },
      d30: { active: o.a30, new: n.n30, seconds: o.s30 },
      backups30: o.b30, restores30: o.r30
    },
    trend, retention,
    games: games.map(g => ({ id: g.game, title: titles[g.game] || g.game, players: g.players, starts: g.starts, seconds: g.seconds,
      nextDay: { n: nextDay.get(g.game)?.n || 0, r: nextDay.get(g.game)?.r || 0 } })),
    sources
  }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

// 游戏中文名取自平台首页的 CATALOG，不在这里另维护一份
async function catalogTitles(req, env) {
  const res = await env.ASSETS.fetch(new Request(new URL('/', req.url)));
  const html = res.ok ? await res.text() : '';
  return Object.fromEntries([...html.matchAll(/\{ id:'([a-z0-9-]+)', title:'([^']+)'/g)].map(m => [m[1], m[2]]));
}
