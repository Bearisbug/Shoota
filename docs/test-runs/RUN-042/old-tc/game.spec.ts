// 游戏相关的旧用例 TC-018、TC-019、TC-022、TC-023、TC-026、TC-032 在重写版上的执行脚本（一次性，步骤与预期照 docs/TEST.md）
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Frame, Page } from '@playwright/test';
import { CATALOG } from '../../../../src/catalog';
import { expect, sleep, test } from '../../../../e2e/lib/fixtures';
import {
  cardIds, closePanel, copy, dotLit, exitGame, frameText, openDetail, openPanel, play, section, startControl, title, waitPlayable, startGame,
} from '../../../../e2e/lib/ui';

const W = new URL('../../../../', import.meta.url).pathname; // 项目根
const EV = process.env.EV ?? 'test-results/old-tc-ev'; // 截图与读数的输出目录，相对运行目录
mkdirSync(EV, { recursive: true });
const NEW3 = ['f1-driver', 'wealth-reborn', 'basketball-star'];
const ORDER13 = ['薯光 · Spud Dawn', 'F1-Driver', 'F1-Team Principal', '篮球巨星', '我要当首富', '斗罗·万相', '重生之我是夜宵摊摊主', '后宫生死簿', 'NBA-经理', 'CBA-经理', 'lol电竞经理', '一克之差', '杀穿娱乐圈'];
const SAVED = /^已存档 \d\d:\d\d$/;
const searchBox = (page: Page) => page.getByRole('searchbox', { name: copy.search.label }).locator('visible=true').first();
const allSection = (page: Page) => section(page, /^搜索「.+」$/).or(section(page, copy.store.all)).first();
const libraryList = (page: Page) => page.getByRole('list', { name: copy.library.listLabel });
const vis = (fr: Frame, text: string, exact = true) => fr.getByText(text, { exact }).locator('visible=true').first();
const css = (fr: Frame, sel: string) => fr.locator(sel).locator('visible=true').first();
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = (page: Page, name: string) => page.screenshot({ path: `${EV}/${name}.png` });

async function panelSaved(page: Page) {
  const p = await openPanel(page);
  await expect(p.getByText(SAVED)).toBeVisible({ timeout: 15_000 });
  const s = await p.getByText(SAVED).innerText();
  await closePanel(page);
  return s;
}

// 三款新游戏的开局流程（2026-10-22 在 8812 上按界面文字探明）
async function f1Start(fr: Frame) {
  await vis(fr, '创建车手，选择车队').click();
  await vis(fr, '查看正式合同').click();
  await vis(fr, '签下正式合同').click();
  await expect.poll(() => frameText(fr), { timeout: 15_000 }).toMatch(/2026 · R1\/22/);
}
async function wealthStart(fr: Frame) {
  await css(fr, 'input').fill('张三');
  await css(fr, 'button.gold-button').click();
  await vis(fr, '在此摆摊', false).click();
  await dismissWealthOffer(fr);
}
async function dismissWealthOffer(fr: Frame) {
  const b = vis(fr, '暂不参与，继续经营');
  if (await b.isVisible({ timeout: 2000 }).catch(() => false)) await b.click();
  else await b.waitFor({ timeout: 2000 }).then(() => b.click()).catch(() => {});
}
async function wealthWeek(fr: Frame) {
  await vis(fr, '进货，经营一周').click();
  await expect.poll(() => frameText(fr), { timeout: 15_000 }).toMatch(/第\s*2\s*周/);
}
async function basketStart(fr: Frame) {
  await css(fr, 'input').fill('上线球员');
  await css(fr, 'button:has-text("控球后卫")').click();
  await vis(fr, '下一步：选择球队 ▸').click();
  await css(fr, 'button:has-text("上海久事")').click();
  await vis(fr, '下一步：确认开局 ▸').click();
  await vis(fr, '确认并开始生涯 ▸').click();
  await expect(fr.getByRole('heading', { name: '生涯总览' }).or(fr.getByText('生涯总览', { exact: true })).locator('visible=true').first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => frameText(fr)).toContain('上线球员 · 上海久事');
}

test('TC-018 三款新游戏的目录、封面与游玩', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await test.step('1 打开商店：共 13 款，「全部游戏」顺序同用例', async () => {
    await page.goto('/');
    const s = section(page, copy.store.all);
    await expect(s.getByText(copy.store.count(13), { exact: true })).toBeVisible();
    expect((await cardIds(s)).map(title)).toEqual(ORDER13);
    await shot(page, 'TC-018-store');
  });
  await test.step('2 两个 F1 的详情：标题 F1-Driver、F1-Team Principal，开始入口指向 f1-driver、f1', async () => {
    for (const [id, name] of [['f1-driver', 'F1-Driver'], ['f1', 'F1-Team Principal']]) {
      await page.goto('/#game-' + id);
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
      const c = startControl(page);
      const href = await c.getAttribute('href');
      if (href) expect(href).toBe('#play-' + id);
      else {
        await c.click();
        await expect(page).toHaveURL(new RegExp(`#play-${id}$`));
        await waitPlayable(page, id, 60_000);
        await exitGame(page, id);
      }
    }
  });
  await test.step('3 按三款新游戏的完整名称分别搜索：每次都找到对应卡片', async () => {
    await page.goto('/');
    for (const id of NEW3) {
      await searchBox(page).fill(title(id));
      await expect(page.getByRole('heading', { name: `搜索「${title(id)}」` })).toBeVisible();
      expect(await cardIds(allSection(page))).toContain(id);
    }
    await searchBox(page).fill('');
  });
  await test.step('4 三款新游戏的详情，玩过后再看游戏库：同一张封面、名称与玩法简介', async () => {
    const detail: Record<string, string> = {};
    for (const id of NEW3) {
      await openDetail(page, id);
      const g = CATALOG.find(x => x.id === id)!;
      await expect(page.getByText(g.sub, { exact: true }).locator('visible=true').first()).toBeVisible();
      const img = page.locator(`main img[src*="${g.cover.split('/').pop()}"]`).locator('visible=true').first();
      await expect(img).toBeVisible();
      expect(await img.evaluate(i => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      detail[id] = await img.getAttribute('src') ?? '';
      await play(page, id);
      await sleep(1500);
      await exitGame(page, id);
    }
    await page.goto('/#library');
    for (const id of NEW3) {
      const g = CATALOG.find(x => x.id === id)!;
      await libraryList(page).getByRole('listitem').filter({ hasText: g.title }).first().click();
      const main = page.getByRole('main');
      await expect(main.getByText(g.title, { exact: true }).locator('visible=true').last()).toBeVisible();
      await expect(main.getByText(g.sub, { exact: true }).locator('visible=true').first()).toBeVisible();
      const img = main.locator(`img[src="${detail[id]}"]`).locator('visible=true').first();
      await expect(img).toBeVisible();
      expect(await img.evaluate(i => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await shot(page, `TC-018-library-${id}`);
    }
  });
  await test.step('5 390 宽：商店、三个详情与游戏库没有横向滚动', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const h of ['/#store', ...NEW3.map(id => '/#game-' + id), '/#library']) {
      await page.goto(h);
      await sleep(800);
      expect(await noHScroll(page), h).toBe(true);
      await shot(page, `TC-018-m390-${h.slice(2)}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await test.step('6 F1-Driver 创建车手后签下正式合同：进入 2026 赛季第 1 站', async () => {
    const fr = await play(page, 'f1-driver');
    await f1Start(fr);
    await shot(page, 'TC-018-play-f1-driver');
    await exitGame(page, 'f1-driver');
  });
  await test.step('7 我要当首富建立玩家，摆摊后经营一周：进入第 2 周', async () => {
    const fr = await play(page, 'wealth-reborn');
    await wealthStart(fr);
    await wealthWeek(fr);
    await shot(page, 'TC-018-play-wealth-reborn');
    await exitGame(page, 'wealth-reborn');
  });
  await test.step('8 篮球巨星创建球员，选上海久事后确认开局：进入 CBA 生涯总览', async () => {
    const fr = await play(page, 'basketball-star');
    await basketStart(fr);
    expect(await frameText(fr)).toContain('CBA');
    await shot(page, 'TC-018-play-basketball-star');
    await exitGame(page, 'basketball-star');
  });
  await test.step('9 逐个打开其余十款：都出现游戏画面，没有运行错误', async () => {
    errors.length = 0;
    const seen: Record<string, string[]> = {};
    for (const g of CATALOG.filter(x => !NEW3.includes(x.id))) {
      const before = errors.length;
      await startGame(page, g.id);
      await waitPlayable(page, g.id, 60_000);
      await sleep(3000);
      seen[g.id] = errors.slice(before);
      await exitGame(page, g.id);
    }
    writeFileSync(`${EV}/TC-018-step9-errors.json`, JSON.stringify(seen, null, 1));
    expect(Object.keys(seen)).toHaveLength(10);
    expect(errors).toEqual([]);
  });
  await test.step('10 npm run check 与 npx tsc -b：退出码 0；游戏标识唯一，封面与登记大小对得上', async () => {
    const out: string[] = [];
    for (const [cmd, args] of [['npm', ['run', 'check']], ['npx', ['tsc', '-b']]] as const) {
      out.push(`$ ${cmd} ${args.join(' ')}\n` + execFileSync(cmd, args as unknown as string[], { cwd: W, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    }
    writeFileSync(`${EV}/TC-018-step10.txt`, out.join('\n'));
    expect(out[0]).toMatch(/标识唯一|唯一/);
    expect(out[0]).toMatch(/封面/);
  });
});

// 手动档：三款各自的存档界面（2026-10-22 探明）
async function f1Manual(fr: Frame) {
  await vis(fr, '存档与设置').click();
  await vis(fr, '存入').click();
}
async function wealthManual(fr: Frame) {
  await vis(fr, '存档').click();
  await vis(fr, '手动保存一份').click();
}
async function basketManual(fr: Frame) {
  await vis(fr, '存档 · 规则').click();
  await vis(fr, '保存当前').click();
}
// EXPLORE=1 时拦掉 /api，探路时不写本地库
test.beforeEach(async ({ page }) => {
  if (process.env.EXPLORE) await page.route('**/api/**', r => r.abort());
});
const isolate = async (p: Promise<Page>) => {
  const pg = await p;
  if (process.env.EXPLORE) await pg.context().route('**/api/**', r => r.abort());
  return pg;
};
const dump = (fr: Frame) => frameText(fr).then(t => t.replace(/\s+/g, ' '));

async function douluoStart(fr: Frame) {
  await css(fr, 'button:has-text("武魂殿·黄金一代")').click();
  await vis(fr, '开始这一世 ▸').click();
}
const OLD_IDS = () => [...execFileSync('git', ['-C', W, 'show', 'dd731d6:public/index.html'], { encoding: 'utf8', maxBuffer: 64 << 20 }).matchAll(/\{ ?id:'([^']+)'/g)].map(m => m[1]);
const gamesUnchanged = () => execFileSync('git', ['-C', W, 'diff', '--stat', 'dd731d6', '--', 'public/games', 'public/covers'], { encoding: 'utf8' }).trim();
const runCheck = () => execFileSync('npm', ['run', 'check'], { cwd: W, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
async function coverLoaded(page: Page, id: string) {
  const g = CATALOG.find(x => x.id === id)!;
  const img = page.getByRole('main').locator(`img[src*="${g.cover.split('/').pop()}"]`).locator('visible=true').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return img;
}

test('TC-019 新游戏进度保存与隔离', async ({ fresh }) => {
  const page = await isolate(fresh({ permissions: ['clipboard-read', 'clipboard-write'] }));
  const log: Record<string, string> = {};
  await test.step('1 三款各建一份进度并各存一个手动档：保存后面板显示「已存档」与时间', async () => {
    let fr = await play(page, 'f1-driver');
    await f1Start(fr);
    await f1Manual(fr);
    await expect(vis(fr, '已保存到手动存档 1')).toBeVisible();
    log['f1'] = await panelSaved(page);
    await exitGame(page, 'f1-driver');

    fr = await play(page, 'wealth-reborn');
    await wealthStart(fr);
    await wealthManual(fr);
    await expect.poll(() => frameText(fr)).toMatch(/手动档\s+\d\d\/\d\d\s+\d\d:\d\d/);
    log['wealth'] = await panelSaved(page);
    await exitGame(page, 'wealth-reborn');

    fr = await play(page, 'basketball-star');
    await basketStart(fr);
    await basketManual(fr);
    await expect.poll(() => frameText(fr)).toMatch(/01\s+上线球员 · 17岁 · PG/);
    log['basket'] = await panelSaved(page);
    await exitGame(page, 'basketball-star');
  });
  await test.step('2 刷新后逐款进入：自动进度保留人物、球队或周次；手动档在列表里，能读取', async () => {
    await page.reload();
    let fr = await play(page, 'f1-driver');
    await expect.poll(() => frameText(fr)).toMatch(/Racing Bulls · 林远 #66 2026 · R1\/22|林远[\s\S]*R1\/22/);
    await vis(fr, '存档与设置').click();
    await expect.poll(() => frameText(fr)).toMatch(/手动存档 1\s*林远 · 2026\s*Racing Bulls/);
    await vis(fr, '读取').click();
    await expect.poll(() => frameText(fr)).toMatch(/林远[\s\S]*R1\/22/);
    await exitGame(page, 'f1-driver');

    fr = await play(page, 'wealth-reborn');
    await expect.poll(() => frameText(fr)).toMatch(/张三[\s\S]*继续这段经营/);
    await vis(fr, '切换玩家 / 读取存档').click();
    await expect.poll(() => frameText(fr)).toMatch(/手动档\s+\d\d\/\d\d\s+\d\d:\d\d/);
    await fr.getByText('读取并继续', { exact: true }).locator('visible=true').nth(1).click();
    await expect.poll(() => frameText(fr)).toMatch(/张三[\s\S]*个人现金/);
    await exitGame(page, 'wealth-reborn');

    fr = await play(page, 'basketball-star');
    await expect.poll(() => frameText(fr)).toContain('上线球员 · 上海久事');
    await vis(fr, '存档 · 规则').click();
    await expect.poll(() => frameText(fr)).toMatch(/01\s+上线球员 · 17岁 · PG/);
    await vis(fr, '加载').click();
    await expect.poll(() => frameText(fr)).toContain('上线球员 · 上海久事');
    await exitGame(page, 'basketball-star');
  });
  await test.step('3 斗罗玩到产生存档，再依次回到三款新游戏：不串档，斗罗能继续', async () => {
    let fr = await play(page, 'douluo');
    await douluoStart(fr);
    log['douluo'] = await panelSaved(page);
    const dl = (await frameText(fr)).replace(/\s+/g, ' ').slice(0, 200);
    log['douluo-text'] = dl;
    await exitGame(page, 'douluo');
    for (const [id, own] of [['f1-driver', '林远'], ['wealth-reborn', '张三'], ['basketball-star', '上线球员']]) {
      fr = await play(page, id);
      await expect.poll(() => frameText(fr)).toContain(own);
      expect(await frameText(fr)).not.toContain('苏夜');
      await exitGame(page, id);
    }
    fr = await play(page, 'douluo');
    await expect.poll(() => frameText(fr)).toContain('苏夜');
    await exitGame(page, 'douluo');
  });
  let code = '';
  await test.step('4 存档页复制存档码，到另一个新浏览器粘贴并确认恢复：四款都能继续，手动档保留', async () => {
    await page.goto('/#backup');
    await page.getByRole('button', { name: copy.backup.copy, exact: true }).click();
    await expect(page.getByText(copy.backup.copied).first()).toBeVisible();
    code = await page.evaluate(() => navigator.clipboard.readText());
    expect(code).toMatch(/^CJ/);
    log['code-chars'] = String(code.length);
    const b = await isolate(fresh());
    await b.goto('/#backup');
    await b.getByPlaceholder(copy.backup.placeholder).fill(code);
    await b.getByRole('button', { name: copy.backup.restore, exact: true }).click();
    await b.getByRole('button', { name: copy.backup.confirm, exact: true }).click();
    await expect(b.getByText(copy.backup.restored(4)).first()).toBeVisible();
    let fr = await play(b, 'f1-driver');
    await expect.poll(() => frameText(fr)).toMatch(/林远[\s\S]*R1\/22/);
    await vis(fr, '存档与设置').click();
    await expect.poll(() => frameText(fr)).toMatch(/手动存档 1\s*林远 · 2026\s*Racing Bulls/);
    await exitGame(b, 'f1-driver');
    fr = await play(b, 'wealth-reborn');
    await expect.poll(() => frameText(fr)).toMatch(/张三[\s\S]*继续这段经营/);
    await vis(fr, '切换玩家 / 读取存档').click();
    await expect.poll(() => frameText(fr)).toMatch(/手动档\s+\d\d\/\d\d\s+\d\d:\d\d/);
    await exitGame(b, 'wealth-reborn');
    fr = await play(b, 'basketball-star');
    await expect.poll(() => frameText(fr)).toContain('上线球员 · 上海久事');
    await vis(fr, '存档 · 规则').click();
    await expect.poll(() => frameText(fr)).toMatch(/01\s+上线球员 · 17岁 · PG/);
    await exitGame(b, 'basketball-star');
    fr = await play(b, 'douluo');
    await expect.poll(() => frameText(fr)).toContain('苏夜');
    await shot(b, 'TC-019-restored-douluo');
    await exitGame(b, 'douluo');
  });
  writeFileSync(`${EV}/TC-019.json`, JSON.stringify(log, null, 1));
});

test('TC-022 游戏里的外部链接在新标签页打开', async ({ fresh }) => {
  const page = await isolate(fresh());
  const ctx = page.context();
  // 不连外网：nbpa.com 由本地桩页应答，只看新标签页请求的地址
  await ctx.route(/^https?:\/\/([a-z0-9-]+\.)*nbpa\.com\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>stub' }));
  let fr!: Frame;
  await test.step('1 篮球巨星创建球员并确认开局，切到「存档 · 规则」：看到「NBA / NBPA 劳资协议」链接', async () => {
    fr = await play(page, 'basketball-star');
    await basketStart(fr);
    await vis(fr, '存档 · 规则').click();
    await expect(vis(fr, 'NBA / NBPA 劳资协议')).toBeVisible();
  });
  let popup!: Page;
  await test.step('2 点这个链接：开出新标签页，地址是 https://nbpa.com/cba', async () => {
    const external: string[] = [];
    ctx.on('request', r => { if (!r.url().startsWith('http://localhost')) external.push(r.url()); });
    [popup] = await Promise.all([ctx.waitForEvent('page'), vis(fr, 'NBA / NBPA 劳资协议').click()]);
    await expect.poll(() => external[0]).toBe('https://nbpa.com/cba');
    await expect.poll(() => popup.url()).toBe('https://nbpa.com/cba');
  });
  await test.step('3 回到游戏所在的标签页：仍停在「存档 · 规则」，球员还在', async () => {
    await page.bringToFront();
    await expect.poll(() => frameText(fr)).toContain('存档与规则');
    expect(await frameText(fr)).toContain('上线球员 · 上海久事');
    await shot(page, 'TC-022-rules');
  });
  await popup.close();
});

test('TC-023 重开我要当首富时游戏面板保持「已读取存档」', async ({ fresh }) => {
  const page = await isolate(fresh());
  let fr = await play(page, 'wealth-reborn');
  await wealthStart(fr);
  await wealthWeek(fr);
  await sleep(1500);
  await exitGame(page, 'wealth-reborn');
  const r: Record<string, unknown> = {};
  await test.step('1 重新打开我要当首富，打开面板：「已读取存档」', async () => {
    fr = await play(page, 'wealth-reborn');
    const p = await openPanel(page);
    await expect(p.getByText('已读取存档', { exact: true })).toBeVisible();
    await closePanel(page);
  });
  await test.step('2 关掉面板等 5 秒再打开：仍是「已读取存档」，这 5 秒悬浮按钮没亮过小点', async () => {
    let lit = 0;
    const end = Date.now() + 5000;
    while (Date.now() < end) { if (await dotLit(page)) lit++; await sleep(100); }
    r.litSamples = lit;
    expect(lit).toBe(0);
    const p = await openPanel(page);
    await expect(p.getByText('已读取存档', { exact: true })).toBeVisible();
    await closePanel(page);
  });
  await test.step('3 点「继续这段经营」后点「经营一周」：1 秒内小点亮起；面板「已存档」与当前时分', async () => {
    await vis(fr, '继续这段经营').click();
    await dismissWealthOffer(fr);
    const btn = vis(fr, '进货，经营一周');
    await btn.waitFor();
    const t0 = Date.now();
    await btn.click();
    let at = 0;
    while (Date.now() - t0 < 3000) { if (await dotLit(page)) { at = Date.now() - t0; break; } await sleep(50); }
    r.dotMs = at;
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(1000);
    const now = new Date();
    const s = await panelSaved(page);
    r.panel = s;
    expect(s).toBe(`已存档 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  });
  writeFileSync(`${EV}/TC-023.json`, JSON.stringify(r));
});

test('TC-026 经理游戏与斗罗封面更新', async ({ page }) => {
  const MGR = ['f1', 'nba', 'cba'];
  await test.step('1 商店分别搜索三个经理游戏新名称：各命中一款，原游戏顺序不变', async () => {
    await page.goto('/');
    expect((await cardIds(section(page, copy.store.all))).map(title)).toEqual(ORDER13);
    for (const id of MGR) {
      await searchBox(page).fill(title(id));
      await expect(page.getByRole('heading', { name: `搜索「${title(id)}」` })).toBeVisible();
      expect(await cardIds(allSection(page))).toEqual([id]);
    }
    await searchBox(page).fill('');
  });
  await test.step('2 四款详情与经理游戏库卡片：封面加载、标题可读；斗罗九个完整魂环；经理简介符合玩法', async () => {
    for (const id of [...MGR, 'douluo']) {
      await openDetail(page, id);
      const img = await coverLoaded(page, id);
      if (id === 'douluo') await img.screenshot({ path: `${EV}/TC-026-douluo-cover.png` });
      const g = CATALOG.find(x => x.id === id)!;
      await expect(page.getByText(g.sub, { exact: true }).locator('visible=true').first()).toBeVisible();
      // 游戏库只列玩过或加入愿望单的游戏：经理游戏先加入愿望单，卡片才会出现
      if (id !== 'douluo') await page.getByRole('button', { name: copy.game.wishAdd, exact: true }).click();
    }
    expect(CATALOG.filter(x => MGR.includes(x.id)).map(x => x.sub.split(' · ')[0])).toEqual(['执掌维修区', '掌控阵容', '统筹内外援']);
    await page.goto('/#library');
    for (const id of MGR) {
      await libraryList(page).getByRole('listitem').filter({ hasText: title(id) }).first().click();
      await coverLoaded(page, id);
      await expect(page.getByRole('main').getByText(title(id), { exact: true }).locator('visible=true').last()).toBeVisible();
    }
    await shot(page, 'TC-026-library');
  });
  await test.step('3 从平台打开三个经理游戏：加载至可操作画面', async () => {
    for (const id of MGR) {
      await startGame(page, id);
      await waitPlayable(page, id, 60_000);
      await shot(page, `TC-026-play-${id}`);
      await exitGame(page, id);
    }
  });
  await test.step('4 平台质量门与变更文件：通过；游戏 HTML、标识不变', async () => {
    writeFileSync(`${EV}/TC-026-check.txt`, runCheck());
    expect(gamesUnchanged()).toBe('');
    expect(CATALOG.map(g => g.id)).toEqual(OLD_IDS());
  });
});

test('TC-032 其余四款摄影封面与电竞经理改名', async ({ page }) => {
  await test.step('1 商店与四款详情：夜宵摊、后宫、lol电竞经理、一克之差封面完整加载，标题清晰', async () => {
    await page.goto('/');
    for (const id of ['yexiao', 'hougong', 'lol', 'yike']) {
      await openDetail(page, id);
      await coverLoaded(page, id);
      await shot(page, `TC-032-${id}`);
    }
  });
  await test.step('2 搜索 lol电竞经理，进详情再开始：只命中 lol，名称已更新，原游戏正常加载', async () => {
    await page.goto('/');
    await searchBox(page).fill('lol电竞经理');
    await expect(page.getByRole('heading', { name: '搜索「lol电竞经理」' })).toBeVisible();
    expect(await cardIds(allSection(page))).toEqual(['lol']);
    await allSection(page).locator('a[href="#game-lol"]').first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'lol电竞经理' })).toBeVisible();
    await startControl(page).click();
    await waitPlayable(page, 'lol', 60_000);
    await exitGame(page, 'lol');
  });
  await test.step('3 质量门与变更范围：通过；游戏顺序、游戏 HTML、标识不变', async () => {
    writeFileSync(`${EV}/TC-032-check.txt`, runCheck());
    expect(gamesUnchanged()).toBe('');
    expect(CATALOG.map(g => g.id)).toEqual(OLD_IDS());
  });
});

// 第 3 步的「发布」与线上逐文件核验不在本地轮里做，只做字节数与质量门
test('TC-037 F1领队版可选BYD更新', async ({ fresh }) => {
  const page = await isolate(fresh());
  const teams = (fr: Frame) => fr.locator('button').filter({ hasText: /F1 Team|Formula|Racing|Scuderia|BYD/ }).locator('visible=true');
  let fr!: Frame;
  const r: Record<string, unknown> = {};
  await test.step('1 打开新游戏并勾选 BYD 选项：默认 11 队且未勾选，勾选后 12 队并出现 BYD', async () => {
    fr = await play(page, 'f1');
    const box = css(fr, 'input[type=checkbox]');
    await expect(box).not.toBeChecked();
    await expect(teams(fr)).toHaveCount(11);
    await box.check();
    await expect(teams(fr)).toHaveCount(12);
    await expect(css(fr, 'button:has-text("BYD Yangwang")')).toBeVisible();
  });
  await test.step('2 选 BYD 开局，自动保存后刷新并继续：BYD 总部、2026 赛季与原资金保留；开局勾选项重置', async () => {
    await css(fr, 'button:has-text("BYD Yangwang")').click();
    await expect.poll(() => frameText(fr)).toMatch(/BYD 总部/);
    const before = (await frameText(fr)).match(/现金\s*(\$[\d.]+M)/)?.[1];
    r.cashBefore = before;
    r.panel = await panelSaved(page);
    await page.reload();
    fr = await waitPlayable(page, 'f1', 60_000);
    r.afterReload = (await frameText(fr)).replace(/\s+/g, ' ').slice(0, 300);
    const box = fr.locator('input[type=checkbox]').locator('visible=true');
    if (await box.count()) { r.boxAfterReload = await box.first().isChecked(); expect(r.boxAfterReload).toBe(false); }
    const cont = fr.getByText(/^继续/).locator('visible=true').first();
    if (!/BYD 总部/.test(await frameText(fr)) && await cont.count()) await cont.click();
    await expect.poll(() => frameText(fr)).toMatch(/BYD 总部/);
    const t = await frameText(fr);
    expect(t).toMatch(/2026 · R1\/22/);
    expect(t.match(/现金\s*(\$[\d.]+M)/)?.[1]).toBe(before);
    await shot(page, 'TC-037-byd-resumed');
  });
  await test.step('3 字节数与质量门：登记大小等于文件字节数，npm run check 通过（发布与线上核验不在本轮）', async () => {
    const g = CATALOG.find(x => x.id === 'f1')!;
    const bytes = execFileSync('wc', ['-c', `${W}/public/${g.src}`], { encoding: 'utf8' }).trim().split(/\s+/)[0];
    r.bytes = bytes; r.size = g.size;
    expect(Number(bytes)).toBe(g.size);
    writeFileSync(`${EV}/TC-037-check.txt`, runCheck());
  });
  writeFileSync(`${EV}/TC-037.json`, JSON.stringify(r, null, 1));
});
