// 存档搬到 https 的旧用例 TC-027、TC-028、TC-029、TC-031 在重写版上的执行脚本（一次性，步骤与预期照 docs/TEST.md）
// 按 §3「模拟 http 与 https 两个地址」：http://shoota.ai 与 https://shoota.ai 的请求都由 Playwright 转给本地 8812，
// 浏览器加 --no-proxy-server 与 host-resolver 映射，没被转走的请求连不到线上。
// 自己传 --disable-features 会盖掉 Playwright 默认关掉的 HttpsUpgrades，这里要带上，否则 http 的搬家页会被浏览器改成 https。
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { STAT_TABLES, bjDay, clearTables, count, d1 } from '../../../../e2e/lib/d1';
import { expect, sleep, test } from '../../../../e2e/lib/fixtures';
import { copy, exitGame, openPanel, play, closePanel } from '../../../../e2e/lib/ui';
import { readMeta, patchMeta, statOf } from '../../../../e2e/lib/storage';

const HTTP = 'http://shoota.ai', HTTPS = 'https://shoota.ai';
let browser: Browser;

test.beforeAll(async ({ playwright }) => {
  browser = await playwright.chromium.launch({
    channel: 'msedge',
    args: ['--no-proxy-server', '--host-resolver-rules=MAP shoota.ai 127.0.0.1', '--disable-features=IsolateSandboxedIframes,HttpsUpgrades'],
  });
});
test.afterAll(async () => { await browser.close(); });

async function newBrowser(): Promise<{ ctx: BrowserContext; page: Page; navs: string[] }> {
  const ctx = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/shoota\.ai(\/|$)/, async route => {
    const u = new URL(route.request().url());
    const res = await route.fetch({ url: 'http://localhost:8812' + u.pathname + u.search, maxRedirects: 0 });
    const headers = { ...res.headers() };
    if (headers.location) headers.location = headers.location.replace('http://localhost:8812', u.origin);
    await route.fulfill({ status: res.status(), headers, body: await res.body() });
  });
  // 其余外部请求一律不发（字体等），保证不碰线上
  await ctx.route(url => !/^(https?:\/\/shoota\.ai|http:\/\/localhost:8812)/.test(url.href) && /^https?:/.test(url.href), r => r.abort());
  const page = await ctx.newPage();
  const navs: string[] = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });
  return { ctx, page, navs };
}

const vidOf = async (page: Page) => (await readMeta(page))?.vid as string;
const libraryRow = (page: Page, title: string) => page.getByRole('list', { name: copy.library.listLabel }).getByRole('listitem').filter({ hasText: title });
async function playSaved(page: Page, base: string) {
  await play(page, 'yike', base);
  const p = await openPanel(page);
  await expect(p.getByText(/^已存档 \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  await closePanel(page);
  await exitGame(page, 'yike');
}
const movedVia = (navs: string[]) => navs.filter(u => u.startsWith(HTTP + '/move')).length;

test('TC-027 http 下玩过的浏览器在 https 下接着玩', async () => {
  clearTables(...STAT_TABLES);
  const { ctx, page, navs } = await newBrowser();
  let vid = '';
  await test.step('1 http 下开一克之差，面板「已存档」后退出：游戏库有一克之差；旅客表 1 行', async () => {
    await playSaved(page, HTTP);
    await page.goto(HTTP + '/#library');
    await expect(libraryRow(page, '一克之差')).toBeVisible();
    await expect.poll(() => count('visitors')).toBe(1);
    vid = await vidOf(page);
  });
  await test.step('2 同一浏览器打开 https：经过一次 http://shoota.ai/move 回到 https 商店，游戏库有一克之差', async () => {
    navs.length = 0;
    await page.goto(HTTPS + '/');
    await expect.poll(() => page.url()).toMatch(/^https:\/\/shoota\.ai\/#?(store)?$/);
    await expect(page.getByRole('heading', { name: copy.store.title, exact: true }).first()).toBeVisible();
    expect(movedVia(navs)).toBe(1);
    await page.goto(HTTPS + '/#library');
    await expect(libraryRow(page, '一克之差')).toBeVisible();
  });
  await test.step('3 旅客表只有第 1 步那个编号一行', async () => {
    await sleep(2000);
    expect(d1<{ vid: string }>('SELECT vid FROM visitors').map(r => r.vid)).toEqual([vid]);
  });
  await ctx.close();
});

test('TC-028 全新浏览器只跳一次', async () => {
  clearTables(...STAT_TABLES);
  const { ctx, page, navs } = await newBrowser();
  await test.step('1 打开 https://shoota.ai/#backup：经过一次搬家页回到 #backup，显示「备份 / 恢复进度」', async () => {
    await page.goto(HTTPS + '/#backup');
    await expect.poll(() => page.url()).toBe(HTTPS + '/#backup');
    await expect(page.getByRole('heading', { name: copy.backup.title }).first()).toBeVisible();
    expect(movedVia(navs)).toBe(1);
  });
  await test.step('2 刷新：不经过搬家页，仍是备份页', async () => {
    navs.length = 0;
    await page.reload();
    await expect(page.getByRole('heading', { name: copy.backup.title }).first()).toBeVisible();
    expect(movedVia(navs)).toBe(0);
  });
  await test.step('3 旅客表 1 行，今天访问 2', async () => {
    await expect.poll(() => d1<{ visits: number }>(`SELECT visits FROM visitor_days WHERE day = '${bjDay()}'`)[0]?.visits).toBe(2);
    expect(count('visitors')).toBe(1);
  });
  await ctx.close();
});

test('TC-029 两边都有同一款游戏时留时长更长的那份', async ({ request }) => {
  clearTables(...STAT_TABLES);
  const { ctx, page, navs } = await newBrowser();
  let B = '', A = '';
  await test.step('1 https 下开一克之差，「已存档」后退出：旅客表 1 行，记为 B', async () => {
    await page.goto(HTTPS + '/');
    await expect.poll(() => page.url()).toMatch(/^https:/);
    await playSaved(page, HTTPS);
    await expect.poll(() => count('visitors')).toBe(1);
    B = await vidOf(page);
  });
  await test.step('2 http 下开一克之差后退出，把 http 下一克之差累计时长改成 600 秒：旅客表 2 行，新增的记为 A', async () => {
    await page.goto(HTTP + '/');
    await play(page, 'yike', HTTP);
    await exitGame(page, 'yike');
    // 退出后平台还会把本次计时整份写回本机（约 1 秒内），等它写完再改，否则改动被盖掉
    await sleep(3000);
    await patchMeta(page, m => { statOf(m, 'yike').seconds = 600; });
    await expect.poll(() => count('visitors')).toBe(2);
    A = await vidOf(page);
    expect(A).not.toBe(B);
  });
  await test.step('3 回到 https，删掉 changju.moved 后刷新：经过一次搬家页回到商店，游戏库一克之差 10 分钟', async () => {
    await page.goto(HTTPS + '/#store');
    await page.evaluate(() => localStorage.removeItem('changju.moved'));
    navs.length = 0;
    await page.reload();
    await expect.poll(() => page.url()).toMatch(/^https:\/\/shoota\.ai\/#store$/);
    expect(movedVia(navs)).toBe(1);
    await page.goto(HTTPS + '/#library');
    await expect(libraryRow(page, '一克之差')).toContainText('10 分钟');
  });
  await test.step('4 2 秒后查三张表：旅客表只有 A；B 没有行；A 今天访问 4', async () => {
    await sleep(2000);
    expect(d1<{ vid: string }>('SELECT vid FROM visitors').map(r => r.vid)).toEqual([A]);
    for (const t of ['visitors', 'visitor_days', 'game_days']) expect(count(t, `vid = '${B}'`), t).toBe(0);
    expect(d1<{ visits: number }>(`SELECT visits FROM visitor_days WHERE vid = '${A}' AND day = '${bjDay()}'`)[0].visits).toBe(4);
  });
  await test.step('5 /api/merge 发 v 与 from 相同：400 bad-merge', async () => {
    const r = await request.post('/api/merge', { data: { v: A, from: A }, headers: { 'content-type': 'application/json' } });
    expect(r.status()).toBe(400);
    expect((await r.json()).type).toBe('/errors/bad-merge');
  });
  await ctx.close();
});

test('TC-031 本机没发起搬家时地址里的搬家数据不认', async () => {
  clearTables(...STAT_TABLES);
  const x = await newBrowser();
  let code = '';
  await test.step('1 X 在 http 下开一克之差，「已存档」后退出，在存档页复制存档码：以 CJ 开头', async () => {
    await playSaved(x.page, HTTP);
    await x.page.goto(HTTP + '/#backup');
    // http 不是安全上下文，浏览器不给剪贴板接口：点了按钮之后从页面上的存档码框里取
    await x.page.getByRole('button', { name: copy.backup.copy, exact: true }).click();
    code = await x.page.locator('textarea[readonly]').first().inputValue();
    expect(code).toMatch(/^CJ/);
  });
  const y = await newBrowser();
  await test.step('2 新浏览器 Y 打开 https://shoota.ai/#move=<存档码>&r=library：不经过搬家页，地址变成 #library，游戏库是空的', async () => {
    await y.page.goto(`${HTTPS}/#move=${code}&r=library`);
    await expect.poll(() => y.page.url()).toBe(HTTPS + '/#library');
    expect(movedVia(y.navs)).toBe(0);
    await expect(y.page.getByText(copy.library.emptyTitle, { exact: true })).toBeVisible();
  });
  await test.step('3 Y 刷新：经过一次搬家页回到 #library，游戏库仍是空的', async () => {
    y.navs.length = 0;
    await y.page.reload();
    await expect.poll(() => y.page.url()).toBe(HTTPS + '/#library');
    expect(movedVia(y.navs)).toBe(1);
    await expect(y.page.getByText(copy.library.emptyTitle, { exact: true })).toBeVisible();
  });
  await test.step('4 Y 再刷新：不经过搬家页', async () => {
    y.navs.length = 0;
    await y.page.reload();
    await expect(y.page.getByText(copy.library.emptyTitle, { exact: true })).toBeVisible();
    expect(movedVia(y.navs)).toBe(0);
  });
  await test.step('5 新浏览器 Z 直接打开 https://shoota.ai/move：跳到 https://shoota.ai/，显示商店', async () => {
    const z = await newBrowser();
    await z.page.goto(HTTPS + '/move');
    await expect.poll(() => z.page.url()).toMatch(/^https:\/\/shoota\.ai\/(#.*)?$/);
    await expect(z.page.getByRole('heading', { name: copy.store.title, exact: true }).first()).toBeVisible();
    await z.ctx.close();
  });
  await x.ctx.close();
  await y.ctx.close();
});
