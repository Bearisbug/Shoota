// 游戏页：铺满视口、悬浮按钮、游戏面板、全屏与引导、安全区与触控、旋转（docs/TEST.md §4「游戏页」）。
// 真机才看得到的（状态栏、系统返回、主屏幕应用）在 TC-PLAY-008～011、020，由人工跑。
import type { CDPSession, Frame, Page } from '@playwright/test';
import { fsCalls, installFaults, setFaults } from './lib/faults';
import { expect, onlyOn, sleep, test } from './lib/fixtures';
import { launchEvents } from './lib/proxy';
import { CODE_DASHED } from './lib/cloud';
import { readSave, readUi } from './lib/storage';
import {
  SAVE_STATE, box, closePanel, copy, dotLit, expectDetail, exitGame, extra, floatButton, gameFrame,
  openPanel, panel, panelBox, pattern, platformControls, play, rotateHint, startGame, title, toast, waitPlayable,
} from './lib/ui';
import { DESKTOP_UA, IPHONE_UA, WECHAT_UA } from './lib/viewports';

const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
const floatBox = (page: Page) => box(floatButton(page));

// 按住悬浮按钮拖到 (x, y) 松手
async function drag(page: Page, x: number, y: number) {
  const b = await floatBox(page);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
}

// 等按钮贴边停稳：左边或右边离视口边缘 gap 像素
async function expectSnapped(page: Page, side: 'left' | 'right', gap: number) {
  const w = page.viewportSize()!.width;
  await expect.poll(async () => {
    const b = await floatBox(page);
    return side === 'left' ? b.x : w - (b.x + b.width);
  }).toBeCloseTo(gap, 0);
}

async function expectMid(page: Page, y: number, tol: number) {
  await expect.poll(async () => Math.abs(mid(await floatBox(page)) - y)).toBeLessThanOrEqual(tol);
}

const opacity = (page: Page) => floatButton(page).evaluate(el => Number(getComputedStyle(el).opacity));
const isFull = (page: Page) => page.evaluate(() => document.fullscreenElement?.tagName ?? null);
const fullscreenButton = (scope: Page | ReturnType<typeof panel>) =>
  scope.getByRole('button', { name: new RegExp(`^(${copy.player.fullscreen}|${extra.exitFullscreen})$`) });

async function onlyFloat(page: Page) {
  const c = await platformControls(page);
  expect(c.map(x => x.name)).toEqual([copy.player.floatLabel]);
  return c[0];
}

test.describe('竖屏手机', () => {
  onlyOn('portrait');

  test('TC-PLAY-001 游戏页铺满视口，只留悬浮按钮', async ({ page, fresh }) => {
    await test.step('1 打开 NBA-经理：iframe 左上角在 (0, 0)，宽 393、高 852', async () => {
      await play(page, 'nba');
      expect(await box(gameFrame(page, 'nba'))).toMatchObject({ x: 0, y: 0, width: 393, height: 852 });
    });

    await test.step('2 平台控件只有悬浮按钮，大小 44×44', async () => {
      const f = await onlyFloat(page);
      expect([f.w, f.h]).toEqual([44, 44]);
    });

    await test.step('3 悬浮按钮右边离屏幕右边缘 8 像素，中心高度 426 ± 1', async () => {
      await expectSnapped(page, 'right', 8);
      await expectMid(page, 426, 1);
    });

    await test.step('4 横屏视口 852×393 重开：iframe 852×393，平台控件仍只有悬浮按钮', async () => {
      const pg = await fresh({ at: 'landscape' });
      await play(pg, 'nba');
      const b = await box(gameFrame(pg, 'nba'));
      expect([b.width, b.height]).toEqual([852, 393]);
      await onlyFloat(pg);
    });
  });

  test('TC-PLAY-002 拖动悬浮按钮与恢复默认位置', async ({ page }) => {
    await play(page, 'yike');

    await test.step('1 拖到 (60, 150) 松手：贴到左边 8 像素，中心高度 150 ± 2', async () => {
      await drag(page, 60, 150);
      await expectSnapped(page, 'left', 8);
      await expectMid(page, 150, 2);
    });

    await test.step('2 退出再打开一克之差：按钮仍在左边，中心高度 150 ± 2', async () => {
      await exitGame(page, 'yike');
      await startGame(page, 'yike');
      await waitPlayable(page, 'yike');
      await expectSnapped(page, 'left', 8);
      await expectMid(page, 150, 2);
    });

    await test.step('3 按下按钮，移动 5 像素后松开：游戏面板打开', async () => {
      const b = await floatBox(page);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 5, b.y + b.height / 2, { steps: 3 });
      await page.mouse.up();
      await expect(panel(page)).toBeVisible();
    });

    await test.step('4 点「恢复默认按钮位置」：回到右边、中心高度 426 ± 1，changju.ui.v1 里一克之差竖屏的位置被删掉', async () => {
      await panel(page).getByRole('button', { name: copy.player.resetFloat, exact: true }).click();
      await expectSnapped(page, 'right', 8);
      await expectMid(page, 426, 1);
      expect((await readUi(page))?.float.yike?.portrait).toBeUndefined();
    });

    await test.step('5 拖到 (380, 850) 松手：贴到右边，下边离屏幕底边不少于 8 像素', async () => {
      if (await panel(page).isVisible()) await closePanel(page);
      await drag(page, 380, 850);
      await expectSnapped(page, 'right', 8);
      const b = await floatBox(page);
      expect(852 - (b.y + b.height)).toBeGreaterThanOrEqual(8);
    });
  });

  test('TC-PLAY-003 悬浮按钮变淡与减弱动态效果', async ({ page, fresh }) => {
    await test.step('1 画面出现后 4 秒不碰屏幕：不透明度 0.4', async () => {
      await play(page, 'yike');
      await sleep(4000);
      await expect.poll(() => opacity(page), { timeout: 1500 }).toBeCloseTo(0.4, 2);
    });

    await test.step('2 按下悬浮按钮不松开：不透明度回到 1', async () => {
      const b = await floatBox(page);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await expect.poll(() => opacity(page)).toBe(1);
      await page.mouse.up();
    });

    await test.step('3 开减弱动态效果，新浏览器重做第 1 步：不透明度 0.4，过渡时长为 0', async () => {
      const pg = await fresh({ reducedMotion: 'reduce' });
      await play(pg, 'yike');
      await sleep(4000);
      expect(await opacity(pg)).toBeCloseTo(0.4, 2);
      const durations = await floatButton(pg).evaluate(el => getComputedStyle(el).transitionDuration.split(',').map(s => parseFloat(s)));
      expect(durations.every(d => d === 0)).toBe(true);
    });
  });

  test('TC-PLAY-004 竖屏打开游戏面板', async ({ page }) => {
    await play(page, 'yike');

    await test.step('1 点悬浮按钮：面板从底部弹出，标题「游戏菜单」，高度不超过 596', async () => {
      await openPanel(page);
      const b = await panelBox(page);
      expect(b.y + b.height).toBeCloseTo(852, 0);
      expect(b.height).toBeLessThanOrEqual(596.5);
    });

    await test.step('2 面板内容从上到下：游戏名、存档状态、云存档状态、本次 0 分钟、全屏或退出全屏、恢复默认按钮位置、退出游戏', async () => {
      const p = panel(page);
      const cloud = new RegExp(`^(${[extra.cloudOff, extra.cloudPending, extra.cloudOffline, extra.cloudStopped].join('|')}|${pattern(extra.cloudSynced).source})$`);
      const items = [
        p.getByText(title('yike'), { exact: true }).first(),
        p.getByText(SAVE_STATE).first(),
        p.getByText(cloud).first(),
        p.getByText(copy.player.elapsed(0), { exact: true }),
        fullscreenButton(p),
        p.getByRole('button', { name: copy.player.resetFloat, exact: true }),
        p.getByRole('button', { name: copy.player.exit, exact: true }),
      ];
      const ys: number[] = [];
      for (const l of items) ys.push((await box(l)).y);
      for (let i = 1; i < ys.length; i++) expect(ys[i], `第 ${i + 1} 项不在第 ${i} 项下面`).toBeGreaterThanOrEqual(ys[i - 1]);
    });

    await test.step('3 点面板外的游戏区：面板关掉，游戏画面还在', async () => {
      await page.mouse.click(196, 100);
      await expect(panel(page)).toBeHidden();
      await expect(gameFrame(page, 'yike')).toBeVisible();
    });

    await test.step('4 再打开面板，按 Esc：面板关掉', async () => {
      await openPanel(page);
      await closePanel(page);
    });

    await test.step('5 再打开面板，点「关闭」：面板关掉', async () => {
      const p = await openPanel(page);
      await p.getByRole('button', { name: extra.close, exact: true }).click();
      await expect(panel(page)).toBeHidden();
    });
  });

  test('TC-PLAY-012 安卓 UA 下开局请求全屏并锁定方向', async ({ page, fresh, net, context }) => {
    const p = await net();
    await installFaults(context);
    const readyOf = (g: string, since: number) => launchEvents(p).slice(since).find(e => e.g === g && e.p === 'ready');

    await test.step('1 打开薯光详情，点「开始游戏」：点击的同一个事件里对页面根元素请求了全屏，fullscreenElement 是 <html>', async () => {
      await startGame(page, 'spud-dawn', p.url);
      await expect.poll(() => isFull(page)).toBe('HTML');
      const fs = (await fsCalls(page)).filter(c => c.kind === 'fullscreen');
      expect(fs).toHaveLength(1);
      expect(fs[0]).toMatchObject({ target: 'html', active: true });
    });

    await test.step('2 请求锁定 landscape 一次', async () => {
      expect((await fsCalls(page)).filter(c => c.kind === 'lock').map(c => c.arg)).toEqual(['landscape']);
    });

    await test.step('3 等就绪：ready 带 fs 为 2', async () => {
      await waitPlayable(page, 'spud-dawn', 60_000);
      await expect.poll(() => readyOf('spud-dawn', 0)?.fs).toBe(2);
    });

    await test.step('4 方向锁定返回拒绝，新浏览器重做第 1 步：照常开局，游戏区顶部居中提示「横过手机玩更舒服」', async () => {
      const pg = await fresh();
      await installFaults(pg, { lock: 'reject' });
      await startGame(pg, 'spud-dawn', p.url);
      await waitPlayable(pg, 'spud-dawn', 60_000);
      await expect(pg.getByText(copy.player.rotateToLandscape, { exact: true })).toBeVisible();
      // 量提示卡片，不量卡里的文字：文字右边还有关闭按钮
      const hint = await box(pg.getByRole('status').filter({ hasText: copy.player.rotateToLandscape }));
      expect(Math.abs(hint.x + hint.width / 2 - 393 / 2)).toBeLessThanOrEqual(2);
    });

    await test.step('5 电脑视口 1440×900，新浏览器重做第 1 步：没有请求全屏，ready 带 fs 为 0', async () => {
      const pg = await fresh({ at: 'desktop', userAgent: DESKTOP_UA });
      await installFaults(pg);
      const since = launchEvents(p).length;
      await startGame(pg, 'spud-dawn', p.url);
      await waitPlayable(pg, 'spud-dawn', 60_000);
      expect((await fsCalls(pg)).filter(c => c.kind === 'fullscreen')).toHaveLength(0);
      await expect.poll(() => readyOf('spud-dawn', since)?.fs).toBe(0);
    });
  });

  test('TC-PLAY-013 iPhone 与微信 UA 下的面板引导', async ({ fresh }) => {
    const ip = await fresh({ ua: IPHONE_UA });

    await test.step('1 iPhone：打开一克之差再退出，再打开，点悬浮按钮：没有「全屏」，有「添加到主屏幕，全屏玩」', async () => {
      await play(ip, 'yike');
      await exitGame(ip, 'yike');
      await startGame(ip, 'yike');
      await waitPlayable(ip, 'yike');
      const p = await openPanel(ip);
      await expect(fullscreenButton(p)).toHaveCount(0);
      await expect(p.getByRole('button', { name: copy.player.installGuide, exact: true })).toBeVisible();
    });

    await test.step('2 点「添加到主屏幕，全屏玩」：先是恢复码与「复制恢复码」，下面是四个添加步骤', async () => {
      await panel(ip).getByRole('button', { name: copy.player.installGuide, exact: true }).click();
      const code = ip.getByRole('img', { name: CODE_DASHED }).first();
      const copyBtn = ip.getByRole('button', { name: extra.copyCode, exact: true });
      await expect(code).toBeVisible();
      await expect(copyBtn).toBeVisible();
      const steps = [];
      for (const s of extra.installSteps) steps.push(await box(ip.getByText(s, { exact: true })));
      expect((await box(code)).y).toBeLessThan(steps[0].y);
      expect((await box(copyBtn)).y).toBeLessThan(steps[0].y);
      for (let i = 1; i < steps.length; i++) expect(steps[i].y).toBeGreaterThan(steps[i - 1].y);
    });

    const pg = await fresh({ ua: WECHAT_UA });
    const hint = pg.getByText(extra.wechatTitle, { exact: true });

    await test.step('3 微信：打开一克之差，游戏载入时自动弹出「在浏览器打开，可全屏、可横屏」', async () => {
      await startGame(pg, 'yike');
      await expect(hint).toBeVisible({ timeout: 15_000 });
    });

    await test.step('4 点「知道了」，退出再开：不再自动弹出，changju.ui.v1 里有 wechatHintAt', async () => {
      await pg.getByRole('button', { name: extra.gotIt, exact: true }).click();
      await expect(hint).toBeHidden();
      await waitPlayable(pg, 'yike');
      await exitGame(pg, 'yike');
      await startGame(pg, 'yike');
      await waitPlayable(pg, 'yike');
      await sleep(1500);
      await expect(hint).toBeHidden();
      expect(typeof (await readUi(pg))?.wechatHintAt).toBe('number');
    });

    await test.step('5 点悬浮按钮：没有「全屏」，有「在浏览器打开」', async () => {
      const p = await openPanel(pg);
      await expect(fullscreenButton(p)).toHaveCount(0);
      await expect(p.getByRole('button', { name: copy.player.wechatGuide, exact: true })).toBeVisible();
    });
  });
});

test.describe('横屏手机', () => {
  onlyOn('landscape');

  test('TC-PLAY-005 横屏、平板与电脑的面板形态', async ({ page, fresh }) => {
    await test.step('1 横屏 852×393 打开 NBA-经理，点悬浮按钮：面板贴右边，宽 320，高 393', async () => {
      await play(page, 'nba');
      await openPanel(page);
      const b = await panelBox(page);
      expect(b.x + b.width).toBeCloseTo(852, 0);
      expect([b.width, b.height]).toEqual([320, 393]);
    });

    for (const [n, at, w, h] of [[2, 'tablet', 820, 1180], [3, 'desktop', 1440, 900]] as const) {
      await test.step(`${n} ${w}×${h} 重做：面板在悬浮按钮旁弹出，宽 320，整块在屏幕内`, async () => {
        const pg = await fresh({ at });
        await play(pg, 'nba');
        const f = await floatBox(pg);
        await openPanel(pg);
        const b = await panelBox(pg);
        expect(b.width).toBe(320);
        expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= w && b.y + b.height <= h).toBe(true);
        // 「旁」：两个矩形之间的空隙不超过 24 像素
        const gapX = Math.max(0, f.x - (b.x + b.width), b.x - (f.x + f.width));
        const gapY = Math.max(0, f.y - (b.y + b.height), b.y - (f.y + f.height));
        expect(Math.max(gapX, gapY)).toBeLessThanOrEqual(24);
      });
    }
  });

  test('TC-PLAY-014 安全区与触控规则', async ({ fresh }) => {
    const pg = await fresh({ at: 'landscape', ua: IPHONE_UA, viewport: { width: 874, height: 402 } });
    const cdp: CDPSession = await pg.context().newCDPSession(pg);
    // 这条 CDP 命令比 Playwright 自带的协议类型新
    await (cdp.send as (m: string, p: object) => Promise<unknown>)('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 62, bottom: 20, right: 62 } });
    let fr!: Frame;

    await test.step('1 打开 NBA-经理：iframe 在 (62, 0)，750×382；让出的条带是页面背景色', async () => {
      fr = await play(pg, 'nba');
      expect(await box(gameFrame(pg, 'nba'))).toMatchObject({ x: 62, y: 0, width: 750, height: 382 });
      const bg = await pg.evaluate(() => {
        const css = (x: number, y: number) => {
          for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
            const c = getComputedStyle(el).backgroundColor;
            if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
          }
          return getComputedStyle(document.documentElement).backgroundColor;
        };
        const page = getComputedStyle(document.body).backgroundColor;
        return { left: css(30, 200), right: css(844, 200), bottom: css(437, 392), page: page === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).backgroundColor : page };
      });
      expect([bg.left, bg.right, bg.bottom]).toEqual([bg.page, bg.page, bg.page]);
    });

    await test.step('2 悬浮按钮右边离屏幕右边缘 70 像素', () => expectSnapped(pg, 'right', 70));

    await test.step('3 拖到屏幕最右边松手：右边仍离屏幕右边缘 70 像素', async () => {
      await drag(pg, 873, 200);
      await expectSnapped(pg, 'right', 70);
    });

    await test.step('4 游戏区 touch-action 为 manipulation，游戏页根元素 overscroll-behavior 为 none', async () => {
      const s = await gameFrame(pg, 'nba').evaluate(el => {
        const touch: string[] = [], over: string[] = [];
        for (let e: Element | null = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          touch.push(cs.touchAction);
          over.push(cs.overscrollBehaviorY);
        }
        return { touch, over };
      });
      // iframe 本身或它所在的游戏区容器
      expect(s.touch.slice(0, 2)).toContain('manipulation');
      expect(s.over).toContain('none');
    });

    await test.step('5 contextmenu：悬浮按钮上的被拦下，游戏里的没被拦下', async () => {
      const fire = (el: Element) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
      expect(await floatButton(pg).evaluate(fire)).toBe(true);
      expect(await fr.locator('body').evaluate(fire)).toBe(false);
    });

    await test.step('6 视口元信息为 width=device-width,initial-scale=1,viewport-fit=cover，没有 user-scalable', async () => {
      const content = await pg.locator('meta[name="viewport"]').getAttribute('content');
      expect(content?.replace(/\s/g, '')).toBe('width=device-width,initial-scale=1,viewport-fit=cover');
    });
  });

  test('TC-PLAY-018 方向与偏好不符时提示旋转', async ({ fresh }) => {
    const pg = await fresh({ ua: IPHONE_UA });
    const hint = pg.getByText(copy.player.rotateToPortrait, { exact: true });
    const close = pg.getByRole('button', { name: extra.close, exact: true });
    let fr: Frame, shownAt = 0;

    await test.step('1 横屏打开一克之差：游戏区顶部居中一条「竖过手机玩更舒服」，顶边离游戏区顶边 8 像素，有「关闭」', async () => {
      fr = await play(pg, 'yike');
      await expect(hint).toBeVisible();
      shownAt = Date.now();
      const strip = pg.getByRole('status').filter({ has: hint });
      const area = await box(gameFrame(pg, 'yike'));
      // 提示是从上方滑进来的，等滑入停下再量
      await expect.poll(async () => Math.abs((await box(strip)).y - area.y - 8) <= 1, { timeout: 2000 }).toBe(true);
      const card = await box(strip);
      expect(Math.abs(card.x + card.width / 2 - (area.x + area.width / 2))).toBeLessThanOrEqual(1);
      await expect(close).toBeVisible();
    });

    await test.step('2 在提示文字中央点一下：游戏收到这次点击，提示照常显示', async () => {
      await fr.evaluate(() => {
        const w = window as unknown as { __clicks: number };
        w.__clicks = 0;
        document.addEventListener('click', () => { w.__clicks++; }, true);
      });
      const t = await box(hint);
      await pg.mouse.click(t.x + t.width / 2, t.y + t.height / 2);
      expect(await fr.evaluate(() => (window as unknown as { __clicks: number }).__clicks)).toBe(1);
      await expect(hint).toBeVisible();
    });

    await test.step('3 不碰提示：出现 4 秒时还在，8 秒内自动收起；changju.ui.v1 记下一克之差已提示过', async () => {
      await sleep(shownAt + 4000 - Date.now());
      await expect(hint).toBeVisible();
      await expect(hint).toBeHidden({ timeout: Math.max(0, shownAt + 8000 - Date.now()) });
      expect((await readUi(pg))?.rotateHintSeen.yike).toBe(1);
    });

    await test.step('4 退出再打开，点悬浮按钮：不再自动提示，面板里有「这款游戏竖屏玩更舒服」', async () => {
      await exitGame(pg, 'yike');
      await startGame(pg, 'yike');
      await waitPlayable(pg, 'yike');
      await sleep(1500);
      await expect(rotateHint(pg)).toBeHidden();
      const p = await openPanel(pg);
      await expect(p.getByText(extra.preferPortrait, { exact: true })).toBeVisible();
    });

    await test.step('5 竖屏 393×852 打开薯光：提示「横过手机玩更舒服」，点「关闭」后消失', async () => {
      const p2 = await fresh({ at: 'portrait', ua: IPHONE_UA });
      await play(p2, 'spud-dawn');
      const h2 = p2.getByText(copy.player.rotateToLandscape, { exact: true });
      await expect(h2).toBeVisible();
      await p2.getByRole('button', { name: extra.close, exact: true }).click();
      await expect(h2).toBeHidden({ timeout: 1000 });
    });

    await test.step('6 微信 UA 竖屏打开薯光：提示旋转，另有「在微信的设置、通用里打开横屏模式」', async () => {
      const p3 = await fresh({ at: 'portrait', ua: WECHAT_UA });
      await play(p3, 'spud-dawn');
      await expect(p3.getByText(copy.player.rotateToLandscape, { exact: true })).toBeVisible();
      await expect(p3.getByText(copy.player.rotateWechat, { exact: true })).toBeVisible();
    });
  });

  test('TC-PLAY-019 游玩中转动手机', async ({ fresh }) => {
    const pg = await fresh({ at: 'portrait', ua: IPHONE_UA });
    const fr = await play(pg, 'nba');
    await fr.evaluate(() => { (window as unknown as { __mark: number }).__mark = 1; });
    await drag(pg, 60, 150);
    await expectSnapped(pg, 'left', 8);

    await test.step('1 视口改成 852×393：iframe 852×393，游戏页面里的标记还在', async () => {
      await pg.setViewportSize({ width: 852, height: 393 });
      await expect.poll(async () => { const b = await box(gameFrame(pg, 'nba')); return [b.width, b.height]; }).toEqual([852, 393]);
      expect(await fr.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(1);
    });

    await test.step('2 悬浮按钮在右边、中心高度 196 ± 1', async () => {
      await expectSnapped(pg, 'right', 8);
      await expectMid(pg, 196.5, 1);
    });

    await test.step('3 打开面板，视口改回 393×852：面板从底部弹出，按钮回到左边、中心高度 150 ± 2', async () => {
      await openPanel(pg);
      await pg.setViewportSize({ width: 393, height: 852 });
      await expect.poll(async () => { const b = await panelBox(pg); return Math.round(b.y + b.height); }).toBe(852);
      expect((await panelBox(pg)).width).toBeCloseTo(393, 0);
      await expectSnapped(pg, 'left', 8);
      await expectMid(pg, 150, 2);
    });
  });
});

test.describe('电脑', () => {
  onlyOn('desktop');

  test('TC-PLAY-006 退出游戏、浏览器后退与退出前写存档', async ({ page }) => {
    await test.step('1 打开一克之差，在面板里点「退出游戏」：回到详情页，地址 #game-yike', async () => {
      await play(page, 'yike');
      await exitGame(page, 'yike');
      expect(new URL(page.url()).hash).toBe('#game-yike');
    });

    await test.step('2 再开一克之差，画面出现后按浏览器后退：回到详情页，没有游戏 iframe', async () => {
      await startGame(page, 'yike');
      await waitPlayable(page, 'yike');
      await page.goBack();
      await expectDetail(page, 'yike');
      await expect(gameFrame(page, 'yike')).toHaveCount(0);
    });

    await test.step('3 我要当首富建立玩家「张三」，0.3 秒内退出：回到详情页，本机存档里有「张三」', async () => {
      const fr = await play(page, 'wealth-reborn');
      await fr.locator('input').first().fill('张三');
      await fr.locator('button.gold-button').first().click();
      // 开面板与点「退出游戏」在页面里一次做完：逐个经 Playwright 点，机器忙时两次往返就超过 0.3 秒
      const ms = await page.evaluate(([float, title, exit]) => new Promise<number>(done => {
        const t = performance.now();
        document.querySelector<HTMLElement>(`button[aria-label="${float}"]`)!.click();
        const tick = () => {
          const btn = [...document.querySelectorAll<HTMLElement>(`dialog[aria-label="${title}"] button`)].find(b => b.textContent?.trim() === exit);
          if (!btn) { requestAnimationFrame(tick); return; }
          btn.click();
          done(performance.now() - t);
        };
        tick();
      }), [copy.player.floatLabel, copy.player.panelTitle, copy.player.exit] as const);
      expect(ms).toBeLessThanOrEqual(300);
      await expectDetail(page, 'wealth-reborn');
      await expect.poll(async () => JSON.stringify(await readSave(page, 'wealth-reborn') ?? {})).toContain('张三');
    });
  });

  test('TC-PLAY-007 重开一克之差显示已存档', async ({ page }) => {
    await play(page, 'yike');
    await exitGame(page, 'yike');

    await test.step('1 重新打开，画面出现后 2 秒内看悬浮按钮：亮过小点', async () => {
      await startGame(page, 'yike');
      await waitPlayable(page, 'yike');
      const t0 = Date.now();
      let lit = false;
      while (!lit && Date.now() - t0 < 2000) {
        lit = await dotLit(page);
        if (!lit) await page.waitForTimeout(100);
      }
      expect(lit, '2 秒内悬浮按钮上没亮过小点').toBe(true);
    });

    await test.step('2 打开游戏面板：存档状态为「已存档」加当前时分', async () => {
      const p = await openPanel(page);
      const now = Date.now();
      const ok = [new Date(now), new Date(now - 60_000)].map(copy.player.saved);
      expect(ok).toContain(await p.getByText(SAVE_STATE).first().innerText());
    });
  });

  test('TC-PLAY-021 电脑面板里进入与退出全屏', async ({ page, context }) => {
    await installFaults(context);
    await play(page, 'yike');
    const p = panel(page);
    const ensurePanel = async () => { if (!await p.isVisible()) await openPanel(page); return p; };

    await test.step('1 打开面板，点「全屏」：进入全屏，按钮变成「退出全屏」', async () => {
      await (await openPanel(page)).getByRole('button', { name: copy.player.fullscreen, exact: true }).click();
      await expect.poll(() => isFull(page)).not.toBeNull();
      await expect((await ensurePanel()).getByRole('button', { name: extra.exitFullscreen, exact: true })).toBeVisible();
    });

    await test.step('2 点「退出全屏」：退出全屏，按钮变回「全屏」', async () => {
      await (await ensurePanel()).getByRole('button', { name: extra.exitFullscreen, exact: true }).click();
      await expect.poll(() => isFull(page)).toBeNull();
      await expect((await ensurePanel()).getByRole('button', { name: copy.player.fullscreen, exact: true })).toBeVisible();
    });

    await test.step('3 全屏请求返回拒绝，再点「全屏」：停在原样，提示「这个窗口不支持全屏。」', async () => {
      await setFaults(page, { fullscreen: 'reject' });
      await (await ensurePanel()).getByRole('button', { name: copy.player.fullscreen, exact: true }).click();
      await expect(toast(page, copy.player.fullscreenDenied)).toBeVisible();
      expect(await isFull(page)).toBeNull();
    });

    await test.step('4 恢复全屏请求，点「全屏」再点「退出游戏」：先退出全屏，再回到详情页', async () => {
      await setFaults(page, { fullscreen: 'pass' });
      await (await ensurePanel()).getByRole('button', { name: copy.player.fullscreen, exact: true }).click();
      await expect.poll(() => isFull(page)).not.toBeNull();
      await (await ensurePanel()).getByRole('button', { name: copy.player.exit, exact: true }).click();
      await expectDetail(page, 'yike');
      expect(await isFull(page)).toBeNull();
    });
  });
});
