// 平台页面的定位与操作。一律按界面上的文字与可读名找，文字取自 src/app/copy.ts，改文案时用例跟着走。
// 进详情、点开始、找游戏 iframe 这几步在旧版 dd731d6 上同样成立，源自缺陷用例靠它们在旧版上复跑。
// base 是经本地中转打开时的中转地址，不传就用 playwright.config.ts 的 baseURL。
import { expect, type Frame, type Locator, type Page } from '@playwright/test';
import { gameById } from '../../src/catalog';
import { copy, extra } from '../../src/app/player/copy';

export { copy, extra };

export const title = (id: string) => {
  const g = gameById(id);
  if (!g) throw new Error('目录里没有 ' + id);
  return g.title;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anyName = (...names: string[]) => new RegExp(`^(${names.map(esc).join('|')})$`);
// 带参数的文案按占位拼成正则，如 copy.library.undoRecover
export const pattern = (fill: (x: string) => string) => new RegExp(esc(fill('\u0000')).replace('\u0000', '.+'));

// 整页重新载入到某个地址：用例直接改了本机数据时，平台要整页重读一遍（只改地址里的 # 不会重新载入）
export async function loadAt(page: Page, path: string) {
  await page.goto(path);
  await page.reload();
}

export async function openDetail(page: Page, id: string, base = '') {
  await page.goto(base + '/#game-' + id);
  await expect(page.getByRole('heading', { level: 1, name: title(id) })).toBeVisible();
}

// 详情页的「开始游戏」或「继续游戏」，新版可能是按钮，旧版是链接
export const startControl = (page: Page) => {
  const name = anyName(copy.game.start, copy.game.resume);
  return page.getByRole('button', { name }).or(page.getByRole('link', { name })).first();
};

// 在当前详情页点开始，返回点击的时刻
export async function clickStart(page: Page) {
  const btn = startControl(page);
  await btn.scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await btn.click();
  return t0;
}

// 进详情页点开始，返回点击的时刻
export async function startGame(page: Page, id: string, base = '') {
  await openDetail(page, id, base);
  return clickStart(page);
}

export const gameFrame = (page: Page, id: string) => page.locator(`iframe[title="${title(id)}"]`);

// 游戏文档里有可见的文字块或画布才算能玩（与旧版走查脚本的判定相同）
function hasContent() {
  const b = document.body;
  if (!b) return false;
  for (const el of b.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width > 20 && r.height > 20 && ((el as HTMLElement).innerText || '').trim()) return true;
  }
  return !!b.querySelector('canvas');
}

export async function waitPlayable(page: Page, id: string, timeout = 30_000): Promise<Frame> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const h = await gameFrame(page, id).elementHandle({ timeout: 250 }).catch(() => null);
    const fr = h && await h.contentFrame();
    if (fr && await fr.evaluate(hasContent).catch(() => false) && !await loading(page).isVisible()) return fr;
    await page.waitForTimeout(100);
  }
  throw new Error(`${timeout} 毫秒内没等到《${title(id)}》的游戏画面`);
}

// 进详情页点开始，等到游戏画面出现
export async function play(page: Page, id: string, base = '') {
  await startGame(page, id, base);
  return waitPlayable(page, id);
}

export const frameText = (fr: Frame) => fr.evaluate(() => document.body?.innerText ?? '');

// 载入页与失败页（§13 载入页与失败页）
export const loading = (page: Page) => page.getByText(copy.launch.loading);
export const retrying = (page: Page) => page.getByText(copy.launch.retrying);
export const failPage = (page: Page) => page.getByText(extra.failTitle);
export const failReason = (page: Page, why: keyof typeof copy.launch.fail) => page.getByText(copy.launch.fail[why]);
export const retryButton = (page: Page) => page.getByRole('button', { name: copy.launch.retry, exact: true });
export const exitButton = (page: Page) => page.getByRole('button', { name: copy.launch.exit, exact: true });
export const progressBar = (page: Page) => page.getByRole('progressbar');
// 进度百分数：aria-valuenow ÷ aria-valuemax（缺省 100）
export async function progress(page: Page) {
  const bar = progressBar(page);
  const [now, max] = await Promise.all([bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]);
  return Number(now) / (Number(max) || 100) * 100;
}

// 在 ms 毫秒内反复看一个元素，返回它第一次出现时距 t0 的毫秒数，没出现返回 0
export async function firstSeen(l: Locator, t0: number, until: number) {
  while (Date.now() - t0 < until) {
    if (await l.isVisible()) return Date.now() - t0;
    await l.page().waitForTimeout(200);
  }
  return 0;
}


// 悬浮按钮与游戏面板（§13 悬浮按钮、游戏面板）
export const floatButton = (page: Page) => page.getByRole('button', { name: copy.player.floatLabel, exact: true });
export const panel = (page: Page) => page.getByRole('dialog', { name: copy.player.panelTitle });
export const SAVE_STATE = /^(存档待写入|读取存档…|已读取存档|新存档|已存档 \d\d:\d\d)$/;
// 悬浮按钮上的存档小点：亮着时按钮带 data-dot="on"（与运行层约定，见 docs/TEST.md §3「悬浮按钮的小点」）
export const dotLit = (page: Page) => floatButton(page).getAttribute('data-dot').then(v => v === 'on');

// 面板看得见的那一块：<dialog> 铺满整屏（里面有遮罩），面板本身是标题栏所在的那层；等滑入停稳再量
export async function panelBox(page: Page) {
  const l = panel(page).locator('header').first().locator('xpath=..');
  let prev = await box(l);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const cur = await box(l);
    if (cur.x === prev.x && cur.y === prev.y && cur.width === prev.width && cur.height === prev.height) return cur;
    prev = cur;
  }
  return prev;
}

export async function openPanel(page: Page) {
  await floatButton(page).click();
  await expect(panel(page)).toBeVisible();
  return panel(page);
}

export async function closePanel(page: Page) {
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
}

// 回到某款游戏的详情页：地址是 #game-<id>，载入页与失败页都已撤掉（载入页也有一个同名的大标题）
export async function expectDetail(page: Page, id: string, timeout?: number) {
  await expect(page).toHaveURL(new RegExp(`#game-${id}$`), { timeout });
  await expect(page.getByRole('heading', { level: 1, name: title(id) })).toBeVisible({ timeout });
  await expect(loading(page)).toBeHidden({ timeout });
  await expect(failPage(page)).toBeHidden({ timeout });
}

// 从游戏面板退出，等回到详情页
export async function exitGame(page: Page, id: string) {
  const p = await openPanel(page);
  await p.getByRole('button', { name: copy.player.exit, exact: true }).click();
  await expectDetail(page, id);
}

export const hhmm = (t = new Date()) => `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;

// 旋转提示（§13 旋转提示）：两句之一，关掉按钮的可读名是「关闭」
export const rotateHint = (page: Page) => page.getByText(anyName(copy.player.rotateToLandscape, copy.player.rotateToPortrait));
export async function dismissRotateHint(page: Page) {
  if (!await rotateHint(page).isVisible()) return;
  // 提示出现 5 秒后自己收起，点「关闭」之前它可能已经收了
  await page.getByRole('button', { name: extra.close, exact: true }).first().click({ timeout: 2000 }).catch(() => {});
  await expect(rotateHint(page)).toBeHidden();
}

// 平台控件：页面上除游戏 iframe 以外、在可见区内能点、没被别的层盖住的元素
export function platformControls(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button], input, select')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0
        && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth)) return false;
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    })
    .map(el => {
      const r = el.getBoundingClientRect();
      return { name: el.getAttribute('aria-label') || (el as HTMLElement).innerText.trim(), x: r.x, y: r.y, w: r.width, h: r.height };
    }));
}

// 区块：按标题找到所在的 section；卡片按 #game-<id> 或 #play-<id> 链接取游戏标识，顺序即页面顺序
export const section = (page: Page, heading: string | RegExp) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) }).first();
export async function cardIds(scope: Locator) {
  const hrefs = await scope.locator('a[href^="#game-"], a[href^="#play-"]').evaluateAll(as => as.map(a => a.getAttribute('href') ?? ''));
  const ids: string[] = [];
  for (const h of hrefs) {
    const id = h.replace(/^#(game|play)-/, '');
    if (ids[ids.length - 1] !== id) ids.push(id); // 同一张卡片里封面与标题各一个链接
  }
  return ids;
}

export const nav = (page: Page) => page.getByRole('navigation', { name: copy.nav.label }).locator('visible=true').first();
export const navCurrent = (page: Page) => nav(page).locator('[aria-current="page"]');
export const toast = (page: Page, text: string | RegExp) => page.getByText(text).first();

// 平台页面的背景色（body 透明时取 html 的）
export const pageBackground = (page: Page) => page.evaluate(() => {
  const b = getComputedStyle(document.body).backgroundColor;
  return b === 'rgba(0, 0, 0, 0)' || b === 'transparent' ? getComputedStyle(document.documentElement).backgroundColor : b;
});

// 盒子的位置与大小，取不到时报错
export async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('元素不在页面上');
  return b;
}
