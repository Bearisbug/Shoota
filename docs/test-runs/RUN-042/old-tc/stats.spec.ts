// 采集与看板旧用例 TC-001～TC-016、TC-024、TC-030 在重写版上的执行脚本（一次性，步骤与预期照 docs/TEST.md）
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Page, APIRequestContext } from '@playwright/test';
import { STAT_TABLES, LAUNCH_TABLES, bjDay, clearTables, count, d1 } from '../../../../e2e/lib/d1';
import { expect, sleep, test } from '../../../../e2e/lib/fixtures';
import { copy, exitGame, openPanel, play } from '../../../../e2e/lib/ui';
import { readMeta, oldMeta } from '../../../../e2e/lib/storage';

const W = new URL('../../../../', import.meta.url).pathname; // 项目根
const PASSWORD = 'local-test-pass', SECRET = 'local-secret-for-tests';
const seed = () => execFileSync('npx', ['wrangler', 'd1', 'execute', 'shoota-metrics', '--local', '--file', 'scripts/seed-local.sql'], { cwd: W, stdio: 'pipe', maxBuffer: 64 << 20 });
const vidOf = async (page: Page) => (await readMeta(page))?.vid as string;
const vday = (vid: string) => d1<{ visits: number; seconds: number; backups: number; restores: number }>(`SELECT visits, seconds, backups, restores FROM visitor_days WHERE vid = '${vid}' AND day = '${bjDay()}'`)[0];
const gday = (vid: string, g: string) => d1<{ starts: number; seconds: number }>(`SELECT starts, seconds FROM game_days WHERE vid = '${vid}' AND game = '${g}' AND day = '${bjDay()}'`)[0];

async function login(page: Page) {
  await page.goto('/kanban');
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '进入看板' }).click();
  await expect(page.getByRole('heading', { level: 2, name: '启动 · 近 7 天' })).toBeVisible();
}
const section = (page: Page, h: string | RegExp) => page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: h }) });
const rowCells = (page: Page, table: string, head: string | RegExp) =>
  page.getByRole('region', { name: table, exact: true }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: head, exact: true }) }).getByRole('cell');
async function cellTexts(page: Page, table: string, head: string | RegExp) {
  await rowCells(page, table, head).first().waitFor();
  return (await rowCells(page, table, head).allInnerTexts()).map(s => s.trim());
}
const post = (request: APIRequestContext, body: unknown) => request.post('/api/e', { data: body, headers: { 'content-type': 'application/json' } });
const hex32 = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

// 切到另一个标签页：无头浏览器没有真实前后台，把平台页面的可见状态改成隐藏并派发 visibilitychange（RUN-001 起的做法）
const setHidden = (page: Page, hidden: boolean) => page.evaluate(h => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

test('TC-001 首次打开平台记一次访问', async ({ page }) => {
  clearTables(...STAT_TABLES);
  let vid = '';
  await test.step('1 打开平台首页，等商店出现：本地存储有 32 位十六进制旅客编号', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: copy.store.title, exact: true }).first()).toBeVisible();
    await expect.poll(() => vidOf(page)).toMatch(/^[0-9a-f]{32}$/);
    vid = await vidOf(page);
  });
  await test.step('2 visitors：只有这个编号一行，首访今天，desktop，微信 0', async () => {
    await expect.poll(() => count('visitors')).toBe(1);
    const v = d1<{ vid: string; first_day: string; device: string; wechat: number }>('SELECT vid, first_day, device, wechat FROM visitors')[0];
    expect(v).toEqual({ vid, first_day: bjDay(), device: 'desktop', wechat: 0 });
  });
  await test.step('3 visitor_days：今天一行，访问 1，游玩秒数 0', async () => {
    expect(count('visitor_days', `vid = '${vid}'`)).toBe(1);
    expect(vday(vid)).toMatchObject({ visits: 1, seconds: 0 });
  });
  await test.step('4 刷新：visitors 仍一行，今天访问 2', async () => {
    await page.reload();
    await expect.poll(() => vday(vid)?.visits).toBe(2);
    expect(count('visitors')).toBe(1);
  });
});

test('TC-002 开局并游玩约 2 分半', async ({ page }) => {
  test.setTimeout(240_000);
  clearTables(...STAT_TABLES);
  await page.goto('/');
  await expect.poll(() => vidOf(page)).toMatch(/^[0-9a-f]{32}$/);
  const vid = await vidOf(page);
  let t0 = 0;
  await test.step('1 打开一克之差：game_days 今天 yike 一行，开局 1', async () => {
    await play(page, 'yike');
    t0 = Date.now();
    await expect.poll(() => gday(vid, 'yike')?.starts).toBe(1);
  });
  await test.step('2 前台 130 秒：yike 游玩秒数 120，旅客日也是 120', async () => {
    await sleep(130_000 - (Date.now() - t0));
    await expect.poll(() => gday(vid, 'yike')?.seconds, { timeout: 5000 }).toBe(120);
    expect(vday(vid).seconds).toBe(120);
  });
  await test.step('3 再等 20 秒，面板显示「本次 2 分钟」，退出后 145 到 155 秒', async () => {
    await sleep(150_000 - (Date.now() - t0));
    const p = await openPanel(page);
    await expect(p.getByText('本次 2 分钟', { exact: true })).toBeVisible();
    await p.getByRole('button', { name: copy.player.exit, exact: true }).click();
    await expect.poll(() => gday(vid, 'yike')?.seconds, { timeout: 5000 }).toBeGreaterThanOrEqual(145);
    expect(gday(vid, 'yike').seconds).toBeLessThanOrEqual(155);
  });
});

test('TC-003 切到后台立即上报，后台不计时', async ({ page }) => {
  test.setTimeout(180_000);
  clearTables(...STAT_TABLES);
  await page.goto('/');
  await expect.poll(() => vidOf(page)).toMatch(/^[0-9a-f]{32}$/);
  const vid = await vidOf(page);
  await play(page, 'yike');
  const t0 = Date.now();
  await test.step('1 前台 30 秒后切到另一个标签页：2 秒内游玩秒数 30 左右（±5）', async () => {
    await sleep(30_000 - (Date.now() - t0));
    await setHidden(page, true);
    await expect.poll(() => gday(vid, 'yike')?.seconds ?? 0, { timeout: 2000 }).toBeGreaterThanOrEqual(25);
    expect(gday(vid, 'yike').seconds).toBeLessThanOrEqual(35);
  });
  await test.step('2 停 40 秒再切回来：游玩秒数没有增加', async () => {
    const before = gday(vid, 'yike').seconds;
    await sleep(40_000);
    await setHidden(page, false);
    await sleep(2000);
    expect(gday(vid, 'yike').seconds).toBe(before);
  });
});

test('TC-004 非法上报整批拒绝', async ({ request }) => {
  clearTables(...STAT_TABLES);
  const v = hex32();
  const bad = async (body: unknown) => {
    const r = await post(request, body);
    expect(r.status()).toBe(400);
    expect((await r.json()).type).toBe('/errors/bad-event');
  };
  await test.step('1 旅客编号 abc：400 bad-event', () => bad({ v: 'abc', ev: [{ t: 'visit' }] }));
  await test.step('2 类型 click：400 bad-event', () => bad({ v, ev: [{ t: 'click' }] }));
  await test.step('3 一条 play 900 秒：400 bad-event', () => bad({ v, ev: [{ t: 'play', g: 'yike', s: 900 }] }));
  await test.step('4 两条 play 各 200 秒：400 bad-event', () => bad({ v, ev: [{ t: 'play', g: 'yike', s: 200 }, { t: 'play', g: 'yike', s: 200 }] }));
  await test.step('5 21 个访问事件：400 bad-event', () => bad({ v, ev: Array.from({ length: 21 }, () => ({ t: 'visit' })) }));
  await test.step('6 缺少游戏的 start：400 bad-event', () => bad({ v, ev: [{ t: 'start' }] }));
  await test.step('7 三张统计表都没有行', () => {
    for (const t of ['visitors', 'visitor_days', 'game_days']) expect(count(t), t).toBe(0);
  });
});

test('TC-005 复制存档码与恢复进度各记一次', async ({ page: a, fresh, context }) => {
  clearTables(...STAT_TABLES);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await a.goto('/');
  await expect.poll(() => vidOf(a)).toMatch(/^[0-9a-f]{32}$/);
  const va = await vidOf(a);
  await play(a, 'yike');
  await exitGame(a, 'yike');
  let code = '';
  await test.step('1 A 在存档页点「复制存档码」：2 秒内 A 今天备份 1', async () => {
    await a.goto('/#backup');
    await a.getByRole('button', { name: copy.backup.copy, exact: true }).click();
    await expect.poll(() => vday(va)?.backups, { timeout: 2000 }).toBe(1);
    code = await a.evaluate(() => navigator.clipboard.readText());
    expect(code).toMatch(/^CJ/);
  });
  await test.step('2 A 点「下载存档文件」：2 秒内备份 2', async () => {
    await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: copy.backup.download, exact: true }).click()]);
    await expect.poll(() => vday(va)?.backups, { timeout: 2000 }).toBe(2);
  });
  await test.step('3 B 粘贴 A 的存档码并确认恢复：2 秒内 B 恢复 1，A 恢复 0', async () => {
    const b = await fresh();
    await b.goto('/#backup');
    await expect.poll(() => vidOf(b)).toMatch(/^[0-9a-f]{32}$/);
    const vb = await vidOf(b);
    await b.getByPlaceholder(copy.backup.placeholder).fill(code);
    await b.getByRole('button', { name: copy.backup.restore, exact: true }).click();
    await b.getByRole('button', { name: copy.backup.confirm, exact: true }).click();
    await expect.poll(() => vday(vb)?.restores, { timeout: 2000 }).toBe(1);
    expect(vday(va).restores).toBe(0);
  });
});

test('TC-007 同一旅客两个标签页同时首访', async ({ request }) => {
  clearTables(...STAT_TABLES);
  const v = hex32();
  await test.step('1 同一个新编号同时发两个访问上报：都返回 204', async () => {
    const rs = await Promise.all([post(request, { v, ev: [{ t: 'visit' }] }), post(request, { v, ev: [{ t: 'visit' }] })]);
    expect(rs.map(r => r.status())).toEqual([204, 204]);
  });
  await test.step('2 visitors 一行，今天访问 2', () => {
    expect(count('visitors')).toBe(1);
    expect(vday(v).visits).toBe(2);
  });
});

test('TC-008 看板登录', async ({ page, context }) => {
  d1('DELETE FROM login_guards');
  await test.step('1 打开 /kanban：登录页，有密码框与「进入看板」', async () => {
    await page.goto('/kanban');
    await expect(page).toHaveTitle(/shoota 看板/);
    await expect(page.getByLabel('密码')).toBeVisible();
    await expect(page.getByRole('button', { name: '进入看板' })).toBeVisible();
  });
  await test.step('2 错误密码：停在登录页，「密码不对，还能试 4 次」', async () => {
    await page.getByLabel('密码').fill('wrong-password');
    await page.getByRole('button', { name: '进入看板' }).click();
    await expect(page.getByText(/密码不对，还能试 4 次/)).toBeVisible();
    await expect(page.getByRole('button', { name: '进入看板' })).toBeVisible();
  });
  await test.step('3 正确密码：看板五块加「启动 · 近 7 天」', async () => {
    await page.getByLabel('密码').fill(PASSWORD);
    await page.getByRole('button', { name: '进入看板' }).click();
    for (const h of ['概览', '每日趋势 · 近 30 天', '留存 · 近 60 天首访的旅客', '游戏排行 · 近 30 天', '来源与设备 · 近 30 天活跃旅客', '启动 · 近 7 天']) {
      await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
    }
  });
  await test.step('4 关掉标签页重新打开 /kanban：直接显示看板', async () => {
    await page.close();
    const p2 = await context.newPage();
    await p2.goto('/kanban');
    await expect(p2.getByRole('heading', { level: 2, name: '概览' })).toBeVisible();
    await expect(p2.getByLabel('密码')).toHaveCount(0);
  });
  d1('DELETE FROM login_guards');
});

test('TC-009 连错 5 次锁定 15 分钟', async ({ request }) => {
  clearTables(...STAT_TABLES);
  const submit = (password: string) => request.post('/kanban/login', { form: { password }, maxRedirects: 0 });
  await test.step('1 连续 4 次错误密码：401，剩余 4、3、2、1', async () => {
    for (const left of [4, 3, 2, 1]) {
      const r = await submit('wrong');
      expect(r.status()).toBe(401);
      expect(await r.text()).toContain(`密码不对，还能试 ${left} 次`);
    }
  });
  await test.step('2 第 5 次：429，提示几点几分后再试', async () => {
    const r = await submit('wrong');
    expect(r.status()).toBe(429);
    expect(await r.text()).toMatch(/北京时间 \d\d:\d\d 之后再试/);
  });
  await test.step('3 立刻提交正确密码：仍是 429，没有登录态 cookie', async () => {
    const r = await submit(PASSWORD);
    expect(r.status()).toBe(429);
    expect(r.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie').map(h => h.value).join('\n')).not.toContain('sk_session');
  });
  await test.step('4 锁定到期改成 0 再提交正确密码：303 到看板，login_guards 这条删了', async () => {
    d1('UPDATE login_guards SET locked_until = 0');
    const r = await submit(PASSWORD);
    expect(r.status()).toBe(303);
    expect(r.headers().location).toBe('/kanban');
    expect(count('login_guards')).toBe(0);
  });
});

test('TC-010 未登录读取统计', async ({ playwright }) => {
  const get = async (cookie?: string) => {
    const ctx = await playwright.request.newContext({ baseURL: 'http://localhost:8812' });
    const r = await ctx.get('/kanban/data', { headers: cookie ? { cookie } : {} });
    const out = { status: r.status(), text: await r.text() };
    await ctx.dispose();
    return out;
  };
  const sign = (exp: number) => `sk_session=${exp}.${createHmac('sha256', SECRET).update('kanban-session:' + exp).digest('hex')}`;
  const notLogged = (r: { status: number; text: string }) => {
    expect(r.status).toBe(401);
    expect(JSON.parse(r.text).type).toBe('/errors/not-logged-in');
  };
  await test.step('1 不带 cookie：401 not-logged-in，没有统计数字', async () => {
    const r = await get();
    notLogged(r);
    expect(JSON.parse(r.text)).not.toHaveProperty('overview');
  });
  await test.step('2 签名被改过：401 not-logged-in', async () => {
    const good = sign(Date.now() + 3600_000);
    const last = good.at(-1) === '0' ? '1' : '0';
    notLogged(await get(good.slice(0, -1) + last));
  });
  await test.step('3 已过期：401 not-logged-in；同一密钥签的未过期会话 200', async () => {
    notLogged(await get(sign(Date.now() - 60_000)));
    expect((await get(sign(Date.now() + 3600_000))).status).toBe(200);
  });
});

test.describe('看板口径种子', () => {
  test.beforeEach(() => { clearTables(...STAT_TABLES); seed(); });

  test('TC-011 概览与每日趋势', async ({ page }) => {
    await login(page);
    await test.step('1 概览：今日、近 7 天、近 30 天与种子注释一致', async () => {
      expect(await cellTexts(page, '概览', '活跃旅客')).toEqual(['2', '3', '13']);
      expect(await cellTexts(page, '概览', '新旅客')).toEqual(['2', '2', '12']);
      expect(await cellTexts(page, '概览', '游玩时长')).toEqual(['20 分钟', '25 分钟', '1.2 小时']);
      expect(await cellTexts(page, '概览', '人均游玩时长')).toEqual(['10 分钟', '8 分钟', '6 分钟']);
      await expect(page.getByText('近 30 天复制存档码 2 次，恢复进度 1 次')).toBeVisible();
    });
    await test.step('2 每日趋势：近 30 天每天的活跃、新增与时长，没数据的日子为 0', async () => {
      const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() + 8 * 3600e3 - i * 86400e3).toISOString().slice(0, 10));
      // 每日数字表收在「查看每日数字」折叠块里，先展开三处
      for (const sm of await page.getByText('查看每日数字', { exact: true }).all()) await sm.click();
      for (const [t, zero] of [['活跃旅客', '0'], ['新旅客', '0'], ['游玩时长', '0 秒']] as const) {
        const rows = page.getByRole('region', { name: `${t}每日数字` }).getByRole('row');
        await expect(rows).toHaveCount(31); // 表头一行
        const heads = (await rows.getByRole('rowheader').allInnerTexts()).map(s => s.trim());
        expect(heads, t).toEqual(days);
        const vals = (await rows.getByRole('cell').allInnerTexts()).map(s => s.trim());
        expect(vals, t).toContain(zero);
        expect(vals.filter(v => v !== zero).length, t).toBeGreaterThan(0);
      }
      const today = (await rowCells(page, '游玩时长每日数字', days[0]).allInnerTexts())[0];
      expect(today.trim()).toBe('20 分钟');
    });
  });

  test('TC-012 留存表', async ({ page }) => {
    await login(page);
    const day = (n: number) => new Date(Date.now() + 8 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
    await test.step('1 10 天前：新旅客 10，次日 30%，7 日 10%，30 日为空', async () => {
      expect(await cellTexts(page, '留存', day(10))).toEqual(['10', '30%', '10%', '—']);
    });
    await test.step('2 40 天前：新旅客 4，次日 50%，7 日 25%，30 日 25%', async () => {
      expect(await cellTexts(page, '留存', day(40))).toEqual(['4', '50%', '25%', '25%']);
    });
    await test.step('3 今天：次日、7 日、30 日都为空', async () => {
      expect((await cellTexts(page, '留存', day(0))).slice(1)).toEqual(['—', '—', '—']);
    });
  });

  test('TC-013 游戏排行', async ({ page }) => {
    await login(page);
    await test.step('1 按总时长从高到低，列为游戏名、玩家数、开局数、总时长、人均时长、次日回访率', async () => {
      const region = page.getByRole('region', { name: '游戏排行', exact: true });
      expect((await region.getByRole('columnheader').allInnerTexts()).map(s => s.trim())).toEqual(['游戏', '玩家', '开局', '总时长', '人均时长', '次日回访率']);
      expect((await region.getByRole('rowheader').allInnerTexts()).map(s => s.trim())).toEqual(['F1-Team Principal', '一克之差', '斗罗·万相']);
    });
    await test.step('2 F1 与一克之差两行与种子注释一致，显示中文名', async () => {
      expect(await cellTexts(page, '游戏排行', 'F1-Team Principal')).toEqual(['4', '6', '46 分钟', '12 分钟', '33%（1/3）']);
      expect(await cellTexts(page, '游戏排行', '一克之差')).toEqual(['4', '5', '18 分钟', '5 分钟', '33%（1/3）']);
    });
  });

  test('TC-014 来源与设备', async ({ page }) => {
    await login(page);
    const s = section(page, '来源与设备 · 近 30 天活跃旅客');
    await test.step('1 微信内打开、手机、电脑占比与种子注释一致', async () => {
      const share = (label: string) => s.locator('.kb-stat').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd').first();
      await expect(share('微信内打开')).toHaveText('54%');
      await expect(share('手机')).toHaveText('69%');
      await expect(share('电脑')).toHaveText('31%');
    });
    await test.step('2 地区前 10：按旅客数从多到少，取不到的显示「未知」', async () => {
      const items = (await s.getByRole('list', { name: '地区前 10' }).getByRole('listitem').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
      expect(items.slice(0, 2)).toEqual(['中国大陆 8', '中国香港 2']);
      expect(items.slice(2).sort()).toEqual(['日本 1', '未知 1', '美国 1'].sort());
    });
  });

  test('TC-024 看板趋势图的峰值标注留在卡片内', async ({ page, fresh }) => {
    d1(`UPDATE visitor_days SET seconds = 150000 WHERE day = '${bjDay()}'`);
    const check = async (pg: Page, label: string) => {
      const cards = pg.locator('.kb-chart');
      await expect(cards).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const card = (await cards.nth(i).boundingBox())!;
        const peak = (await cards.nth(i).locator('svg text', { hasText: /^最高 / }).boundingBox())!;
        expect(peak.x, `${label} 第 ${i + 1} 张左边`).toBeGreaterThanOrEqual(card.x);
        expect(peak.x + peak.width, `${label} 第 ${i + 1} 张右边`).toBeLessThanOrEqual(card.x + card.width);
      }
    };
    await test.step('1 1280 宽：三张图的「最高」都在卡片左右边缘以内', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await login(page);
      await check(page, '1280');
    });
    await test.step('2 390 宽：同上，没有横向滚动', async () => {
      const m = await fresh({ at: 'portrait', viewport: { width: 390, height: 844 } });
      await login(m);
      await check(m, '390');
      expect(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });

  test('TC-030 老玩家不算新旅客，留存表注明统计首日', async ({ page, fresh }) => {
    await login(page);
    let a0 = '', n0 = '';
    await test.step('1 概览「今日」显示活跃与新旅客两个数', async () => {
      [a0] = await cellTexts(page, '概览', '活跃旅客');
      [n0] = await cellTexts(page, '概览', '新旅客');
      expect(a0).toMatch(/^\d+$/);
      expect(n0).toMatch(/^\d+$/);
    });
    await test.step('2 新浏览器写只有 session 与一克之差 300 秒、没有 vid 的元数据再打开：2 秒内旅客表新增一行，prior 为 1', async () => {
      const before = count('visitors');
      const b = await fresh();
      const meta = oldMeta({ yike: { seconds: 300, last: Date.now() - 3600e3 } });
      await b.addInitScript(m => { if (!localStorage.getItem('changju.meta.v1')) localStorage.setItem('changju.meta.v1', m); }, JSON.stringify(meta));
      await b.goto('http://localhost:8812/');
      await expect.poll(() => count('visitors'), { timeout: 2000 }).toBe(before + 1);
      const vid = await vidOf(b);
      expect(d1<{ prior: number }>(`SELECT prior FROM visitors WHERE vid = '${vid}'`)[0].prior).toBe(1);
    });
    await test.step('3 刷新看板：今日活跃多 1，新旅客不变', async () => {
      await page.reload();
      await expect(page.getByRole('heading', { level: 2, name: '概览' })).toBeVisible();
      expect(await cellTexts(page, '概览', '活跃旅客').then(c => c[0])).toBe(String(Number(a0) + 1));
      expect(await cellTexts(page, '概览', '新旅客').then(c => c[0])).toBe(n0);
    });
    await test.step('4 插入首访 2026-10-20 的旅客，刷新：留存表下方注明统计首日与老玩家', async () => {
      d1(`INSERT INTO visitors (vid, first_day, device, wechat, country, prior) VALUES ('${hex32()}', '2026-10-20', 'desktop', 0, 'CN', 0)`);
      await page.reload();
      await expect(page.getByText('2026-10-20 是统计首日；2026-10-20 到 2026-10-21 首访的新旅客含统计上线前就玩过的人。')).toBeVisible();
    });
  });
});

test('TC-015 看板空数据与读取失败', async ({ page, context }) => {
  clearTables(...STAT_TABLES);
  await login(page);
  await test.step('1 概览 0、0、0 秒、「—」；留存、排行、来源「还没有数据」', async () => {
    expect((await cellTexts(page, '概览', '活跃旅客'))[0]).toBe('0');
    expect((await cellTexts(page, '概览', '新旅客'))[0]).toBe('0');
    expect((await cellTexts(page, '概览', '游玩时长'))[0]).toBe('0 秒');
    expect((await cellTexts(page, '概览', '人均游玩时长'))[0]).toBe('—');
    for (const h of ['留存 · 近 60 天首访的旅客', '游戏排行 · 近 30 天', '来源与设备 · 近 30 天活跃旅客']) {
      await expect(section(page, h).getByText('还没有数据', { exact: true })).toBeVisible();
    }
  });
  await test.step('2 断网点刷新数据：「读取失败」与「重试」，原有内容不清空', async () => {
    await context.setOffline(true);
    await page.getByRole('button', { name: '刷新数据' }).click();
    await expect(page.getByRole('alert')).toContainText('读取失败');
    await expect(page.getByRole('alert').getByRole('button', { name: '重试' })).toBeVisible();
    await expect(rowCells(page, '概览', '活跃旅客')).toHaveCount(3);
  });
  await test.step('3 恢复网络点「重试」：重新显示数据，失败提示消失', async () => {
    await context.setOffline(false);
    await page.getByRole('alert').getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(rowCells(page, '概览', '活跃旅客')).toHaveCount(3);
  });
});

test('TC-016 真实游玩后看板可见', async ({ page, fresh }) => {
  test.setTimeout(240_000);
  clearTables(...STAT_TABLES, ...LAUNCH_TABLES);
  await test.step('1 开局一款游戏，前台 130 秒后打开面板：「本次 2 分钟」，再退出', async () => {
    await play(page, 'yike');
    const t0 = Date.now();
    await sleep(130_000 - (Date.now() - t0));
    const p = await openPanel(page);
    await expect(p.getByText('本次 2 分钟', { exact: true })).toBeVisible();
    await p.getByRole('button', { name: copy.player.exit, exact: true }).click();
  });
  await test.step('2 另一个浏览器登录看板：今日活跃至少 1，今日游玩时长至少 2 分钟', async () => {
    const k = await fresh();
    await sleep(2000);
    await login(k);
    expect(Number((await cellTexts(k, '概览', '活跃旅客'))[0])).toBeGreaterThanOrEqual(1);
    const t = (await cellTexts(k, '概览', '游玩时长'))[0];
    const m = t.match(/^(\d+) 分钟$/) || t.match(/^([\d.]+) 小时$/);
    expect(m, t).not.toBeNull();
    expect(t.endsWith('小时') || Number(m![1]) >= 2, t).toBe(true);
  });
});
