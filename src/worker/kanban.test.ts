// API-002 看板页面、API-003 登录、API-004 看板数据：TC-008～TC-014，会话与 cookie 规则对照旧版 src/worker.js
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { KanbanData } from '../shared/api';
import { GAME_TITLES } from '../catalog';
import type { Env } from './env';
import { DASHBOARD_HTML, PASSWORD, bjToday, call, daysAgo, exec, post, resetDb, rows, seed, testEnv } from './test/setup';

const IP = { 'cf-connecting-ip': '203.0.113.7' };
const submit = (password: string, e: Env = testEnv) =>
  call('/kanban/login', { method: 'POST', body: new URLSearchParams({ password }), headers: IP }, e);

async function signed(exp: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(testEnv.KANBAN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('kanban-session:' + exp)));
  return `sk_session=${exp}.${Array.from(sig, b => b.toString(16).padStart(2, '0')).join('')}`;
}

async function session() {
  const res = await submit(PASSWORD);
  return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}

const data = async (cookie: string) => (await call('/kanban/data', { headers: { cookie } })).json() as Promise<KanbanData>;

beforeAll(resetDb);
beforeEach(resetDb);

describe('API-002 / API-003 看板页面与登录', () => {
  test('TC-008 未登录给登录页，输错提示剩余次数，输对写两个 cookie 后直接看到看板', async () => {
    const page = await call('/kanban');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('cache-control')).toBe('no-store');
    const html = await page.text();
    expect(html).toContain('<p class="err" role="alert"></p>');
    expect(html).toContain('aria-invalid="false"');

    const wrong = await submit('nope');
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const wrongHtml = await wrong.text();
    expect(wrongHtml).toContain('密码不对，还能试 4 次。连错 5 次会锁定 15 分钟。');
    expect(wrongHtml).toContain('aria-invalid="true"');

    const ok = await submit(PASSWORD);
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe('/kanban');
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const [sess, staff] = ok.headers.getSetCookie();
    expect(sess).toMatch(/^sk_session=\d+\.[0-9a-f]{64}; Path=\/kanban; Max-Age=604800; HttpOnly; Secure; SameSite=Lax$/);
    expect(staff).toBe('sk_staff=1; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax');
    expect(await rows('SELECT * FROM login_guards')).toEqual([]); // 输对后删掉失败记录

    const cookie = [sess, staff].map(c => c.split(';')[0]).join('; ');
    const board = await call('/kanban', { headers: { cookie } });
    expect(board.status).toBe(200);
    expect(board.headers.get('cache-control')).toBe('no-store');
    expect(board.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await board.text()).toBe(DASHBOARD_HTML);
  });

  test('TC-009 连错 5 次锁定 15 分钟，锁定期内输对也是 429；锁定到期后输对能登录', async () => {
    for (const left of [4, 3, 2, 1]) {
      const res = await submit('nope');
      expect(res.status).toBe(401);
      expect(await res.text()).toContain(`还能试 ${left} 次`);
    }
    const fifth = await submit('nope');
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const [{ locked_until }] = await rows<{ locked_until: number }>('SELECT locked_until FROM login_guards');
    const hhmm = new Date(locked_until + 8 * 3600000).toISOString().slice(11, 16);
    expect(await fifth.text()).toContain(`这个网络连续输错了 5 次，已锁定。北京时间 ${hhmm} 之后再试。`);
    expect(locked_until - Date.now()).toBeGreaterThan(14 * 60000);

    const right = await submit(PASSWORD);
    expect(right.status).toBe(429);
    expect(right.headers.getSetCookie()).toEqual([]);

    await exec('UPDATE login_guards SET locked_until = 0');
    const again = await submit(PASSWORD);
    expect(again.status).toBe(303);
    expect(await rows('SELECT * FROM login_guards')).toEqual([]);
  });

  test('锁定到期后再输错从 1 重新计；没有表单时按空密码计次', async () => {
    for (let i = 0; i < 5; i++) await submit('nope');
    await exec('UPDATE login_guards SET locked_until = 0');
    expect(await (await submit('nope')).text()).toContain('还能试 4 次');
    const noForm = await call('/kanban/login', { method: 'POST', body: '{}', headers: { ...IP, 'content-type': 'application/json' } });
    expect(noForm.status).toBe(401);
    expect(await noForm.text()).toContain('还能试 3 次');
  });

  test('没配置密码时登录页提示联系管理员，提交返回 503', async () => {
    const bare: Env = { ...testEnv, KANBAN_PASSWORD: undefined };
    const page = await call('/kanban', {}, bare);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('看板还没配置密码，请联系管理员。');
    const res = await submit(PASSWORD, bare);
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('看板还没配置密码，请联系管理员。');
  });

  test('/kanban/ 下其余地址先验会话：未登录给登录页，登录后才从静态资源取', async () => {
    for (const path of ['/kanban/', '/kanban/index.html', '/kanban/login']) {
      const res = await call(path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain('<!doctype html><title>shoota 看板 · 登录</title>');
    }
    const cookie = await session();
    const res = await call('/kanban/', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe(DASHBOARD_HTML);
    expect((await call('/kanban/nope.js', { headers: { cookie } })).status).toBe(404);
  });

  test('TC-010 没有会话、签名被改、会话过期都拿不到统计数字', async () => {
    const good = await signed(Date.now() + 60000);
    const cases = ['', good.slice(0, -1) + (good.endsWith('0') ? '1' : '0'), await signed(Date.now() - 1000), 'sk_session=abc.def', 'sk_session=123'];
    for (const cookie of cases) {
      const res = await call('/kanban/data', { headers: cookie ? { cookie } : {} });
      expect(res.status, cookie).toBe(401);
      expect(res.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
      expect(await res.json()).toEqual({ type: '/errors/not-logged-in', title: '看板会话不存在或已过期', status: 401, instance: '' });
    }
    expect((await call('/kanban/data', { headers: { cookie: good } })).status).toBe(200);
    expect((await call('/kanban/data', { headers: { cookie: good } }, { ...testEnv, KANBAN_SECRET: 'rotated' })).status).toBe(401);
  });
});

describe('API-004 GET /kanban/data', () => {
  test('TC-011～TC-014 看板五块与种子注释一致，游戏名读目录', async () => {
    await seed();
    const res = await call('/kanban/data', { headers: { cookie: await session() } });
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const d = await res.json() as KanbanData;
    const today = bjToday();
    expect(d.today).toBe(today);
    expect([d.statsStart, d.priorSince]).toEqual(['2026-10-20', '2026-10-21']);

    // TC-011 概览与趋势
    expect(d.overview).toEqual({
      today: { active: 2, new: 2, seconds: 1200 },
      d7: { active: 3, new: 2, seconds: 1500 },
      d30: { active: 13, new: 12, seconds: 4440 },
      backups30: 2, restores30: 1,
    });
    expect(d.trend).toHaveLength(30);
    expect(d.trend[0].day).toBe(daysAgo(29));
    expect(d.trend[29]).toEqual({ day: today, active: 2, new: 2, seconds: 1200 });
    expect(d.trend[19]).toEqual({ day: daysAgo(10), active: 11, new: 10, seconds: 2160 });
    expect(d.trend[20]).toEqual({ day: daysAgo(9), active: 3, new: 0, seconds: 780 });
    expect(d.trend[1]).toEqual({ day: daysAgo(28), active: 0, new: 0, seconds: 0 });

    // TC-012 留存
    expect(d.retention).toEqual([
      { day: today, n: 2, r1: null, r7: null, r30: null },
      { day: daysAgo(10), n: 10, r1: 3, r7: 1, r30: null },
      { day: daysAgo(40), n: 4, r1: 2, r7: 1, r30: 1 },
    ]);

    // TC-013 游戏排行，中文名取自 src/catalog/
    expect(d.games).toEqual([
      { id: 'f1', title: GAME_TITLES.f1, players: 4, starts: 6, seconds: 2760, nextDay: { n: 3, r: 1 } },
      { id: 'yike', title: '一克之差', players: 4, starts: 5, seconds: 1080, nextDay: { n: 3, r: 1 } },
      { id: 'douluo', title: '斗罗·万相', players: 1, starts: 1, seconds: 600, nextDay: { n: 1, r: 0 } },
    ]);
    expect(GAME_TITLES.f1).toBe('F1-Team Principal');

    // TC-014 来源与设备
    const { countries, ...totals } = d.sources;
    expect(totals).toEqual({ total: 13, wechat: 7, mobile: 9, desktop: 4 });
    expect(countries.slice(0, 2)).toEqual([{ code: 'CN', n: 8 }, { code: 'HK', n: 2 }]);
    expect(countries.slice(2).sort((a, b) => a.code.localeCompare(b.code))).toEqual([{ code: 'JP', n: 1 }, { code: 'US', n: 1 }, { code: 'XX', n: 1 }]);
  });

  test('空库时五块为 0 或空，启动块为 0', async () => {
    const d = await data(await session());
    expect(d.overview.today).toEqual({ active: 0, new: 0, seconds: 0 });
    expect([d.retention, d.games, d.sources.countries]).toEqual([[], [], []]);
    expect(d.launch).toEqual({
      from: daysAgo(6),
      total: { starts: 0, ready: 0, fail: 0, cancel: 0, b1: 0, b3: 0, b10: 0, b30: 0, bx: 0, fsTry: 0, fsOk: 0 },
      byCountry: [], byGame: [], byEnv: [], reasons: [],
    });
  });

  test('启动块：近 7 天按国家或地区、游戏、打开环境汇总，失败原因单列', async () => {
    const ev = (p: string, extra: object = {}) => ({ p, g: 'yike', r: 'legacy', e: 'browser', ...extra });
    await post('/api/launch', { ev: [ev('start'), ev('start'), ev('ready', { ms: 900, fs: 2, c: 1 }), ev('fail', { ms: 20000, why: 'net-stall', n: 2 })] });
    await post('/api/launch', { ev: [ev('start', { g: 'spud-dawn', e: 'wechat' }), ev('cancel', { g: 'spud-dawn', e: 'wechat', ms: 300 })] });
    await exec(`INSERT INTO launch_days (day, game, country, env, starts, ready) VALUES (?, 'yike', 'JP', 'browser', 5, 5), (?, 'yike', 'JP', 'browser', 9, 9)`, daysAgo(6), daysAgo(7));
    await exec(`INSERT INTO launch_fails (day, country, reason, n) VALUES (?, 'CN', 'net-stall', 1), (?, 'CN', 'boot-timeout', 4)`, daysAgo(3), daysAgo(8));

    const { launch } = await data(await session());
    const z = { starts: 0, ready: 0, fail: 0, cancel: 0, b1: 0, b3: 0, b10: 0, b30: 0, bx: 0, fsTry: 0, fsOk: 0 };
    expect(launch.from).toBe(daysAgo(6));
    expect(launch.total).toEqual({ ...z, starts: 8, ready: 6, fail: 1, cancel: 1, b1: 1, fsTry: 1, fsOk: 1 });
    expect(launch.byCountry).toEqual([
      { country: 'JP', ...z, starts: 5, ready: 5 },
      { country: 'CN', ...z, starts: 3, ready: 1, fail: 1, cancel: 1, b1: 1, fsTry: 1, fsOk: 1 },
    ]);
    expect(launch.byGame).toEqual([
      { id: 'yike', title: '一克之差', ...z, starts: 7, ready: 6, fail: 1, b1: 1, fsTry: 1, fsOk: 1 },
      { id: 'spud-dawn', title: GAME_TITLES['spud-dawn'], ...z, starts: 1, cancel: 1 },
    ]);
    expect(launch.byEnv).toEqual([
      { env: 'browser', ...z, starts: 7, ready: 6, fail: 1, b1: 1, fsTry: 1, fsOk: 1 },
      { env: 'wechat', ...z, starts: 1, cancel: 1 },
    ]);
    expect(launch.reasons).toEqual([{ country: 'CN', reason: 'net-stall', n: 2 }]);
  });
});
