// 张磊 2026-10-22 反馈的三条源自缺陷用例：TC-LAUNCH-001、TC-PLAY-015、TC-PLAY-016（docs/TEST.md §4）。
// 只用新旧两版都有的东西：详情页的开始入口、「正在载入游戏…」、以游戏名为 title 的 iframe。
// 修复前那一轮把 dd731d6 起在 8812 上跑这个文件（TEST.md §3「本地跑旧版」），失败应落在描述现象的那一步。
import type { Frame, Page } from '@playwright/test';
import { measureGame } from './lib/core-area';
import { expect, onlyOn, test } from './lib/fixtures';
import { WEAK, hitsOf, launchEvents } from './lib/proxy';
import { box, clickStart, copy, gameFrame, loading, openDetail, platformControls, play, retrying, waitPlayable } from './lib/ui';
import type { MeasureVp } from './lib/viewports';

const blockGoogleFonts = (page: Page) => page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort('connectionfailed'));

test.describe('TC-LAUNCH-001', () => {
  onlyOn('desktop');
  test.use({ serviceWorkers: 'block' });

  test('TC-LAUNCH-001 第一次下载没有回音时自动重试并进入游戏', async ({ page, net }) => {
    const p = await net({ ...WEAK, mode: 'hang-once' });
    await openDetail(page, 'douluo', p.url);
    await p.idle();
    let t0 = 0;

    await test.step('1 点「开始游戏」', async () => {
      t0 = await clickStart(page);
      await expect(loading(page)).toBeVisible();
    });

    await test.step('2 等到点击后第 20 秒：15 到 20 秒之间出现重试提示，中转记到第二次斗罗文件请求', async () => {
      let seenAt = 0;
      while (Date.now() - t0 < 20_000 && !seenAt) {
        if (await retrying(page).isVisible()) seenAt = Date.now() - t0;
        else await page.waitForTimeout(200);
      }
      expect(seenAt, '点击后 20 秒内没出现「网络不太稳，正在重试…」').toBeGreaterThan(0);
      expect(seenAt).toBeGreaterThanOrEqual(14_500);
      expect(hitsOf(p, 'douluo').length).toBeGreaterThanOrEqual(2);
    });

    await test.step('3 最多等到点击后第 45 秒，游戏画面出现', async () => {
      await waitPlayable(page, 'douluo', 45_000 - (Date.now() - t0));
    });

    await test.step('4 启动上报：start 一条、ready 一条且 n 为 2，没有 fail', async () => {
      await expect.poll(() => launchEvents(p).filter(e => e.g === 'douluo' && e.p === 'ready').length).toBe(1);
      const ev = launchEvents(p).filter(e => e.g === 'douluo');
      expect(ev.filter(e => e.p === 'start')).toHaveLength(1);
      expect(ev.find(e => e.p === 'ready')?.n).toBe(2);
      expect(ev.filter(e => e.p === 'fail')).toHaveLength(0);
    });
  });
});

// 打开一款游戏，核对 iframe 贴满视口、平台控件只剩悬浮按钮
async function checkFills(page: Page, id: string, w: number, h: number) {
  const fr = await play(page, id);
  const b = await box(gameFrame(page, id));
  expect(b.y, 'iframe 顶边').toBeCloseTo(0, 0);
  expect(b.width).toBeCloseTo(w, 0);
  expect(b.height).toBeCloseTo(h, 0);
  return fr;
}

async function onlyFloat(page: Page) {
  expect((await platformControls(page)).map(c => c.name)).toEqual([copy.player.floatLabel]);
}

test.describe('TC-PLAY-015', () => {
  onlyOn('portrait');
  test.use({ reducedMotion: 'reduce' });

  test('TC-PLAY-015 竖屏游戏区不再被平台栏挤占', async ({ page, fresh }) => {
    const run = async (pg: Page, vp: MeasureVp, h: number, min: number) => {
      await blockGoogleFonts(pg);
      let fr: Frame | undefined;
      await test.step(`${vp} 1 打开 NBA-经理：iframe 顶边在 0，高 ${h}`, async () => { fr = await checkFills(pg, 'nba', 393, h); });
      await test.step(`${vp} 2 平台控件只有悬浮按钮`, () => onlyFloat(pg));
      await test.step(`${vp} 3 核心区占比不低于 ${min}%`, async () => {
        const r = await measureGame(pg, fr!, vp, 'nba');
        expect(r.misses).toEqual([]);
        expect(r.coreAreaPct).toBeGreaterThanOrEqual(min);
      });
    };
    await run(page, 'portrait', 852, 70);
    await test.step('4 换成 Safari 可见区 393×659 重做第 1 到 3 步', async () => {
      await run(await fresh({ at: 'safari-portrait', reducedMotion: 'reduce' }), 'safari-portrait', 659, 61);
    });
  });
});

test.describe('TC-PLAY-016', () => {
  onlyOn('landscape');
  test.use({ reducedMotion: 'reduce' });

  test('TC-PLAY-016 横屏游戏区不再被平台栏挤占', async ({ page, fresh }) => {
    await blockGoogleFonts(page);
    await test.step('1 打开斗罗·万相：iframe 顶边在 0，高 393', async () => { await checkFills(page, 'douluo', 852, 393); });
    await test.step('2 平台控件只有悬浮按钮', () => onlyFloat(page));
    await test.step('3 Safari 可见区 734×343 重开斗罗·万相：iframe 734×343，平台控件只有悬浮按钮', async () => {
      const pg = await fresh({ at: 'safari-landscape', reducedMotion: 'reduce' });
      await blockGoogleFonts(pg);
      await checkFills(pg, 'douluo', 734, 343);
      await onlyFloat(pg);
    });
  });
});
