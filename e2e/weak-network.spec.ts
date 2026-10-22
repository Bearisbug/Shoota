// 弱网首开与再开（TC-LAUNCH-009、TC-LAUNCH-010）：延迟 400 毫秒、50 KB/s，Service Worker 照常。
// 计时从点「开始游戏」到游戏画面出现，三款是 2026-10-22 旧版测量里最慢的三款。
import { expect, onlyOn, test } from './lib/fixtures';
import { WEAK, hitsOf, launchEvents } from './lib/proxy';
import { clickStart, exitGame, openDetail, waitPlayable } from './lib/ui';

onlyOn('desktop');

const SLOW = [['spud-dawn', '薯光 · Spud Dawn'], ['wealth-reborn', '我要当首富'], ['douluo', '斗罗·万相']] as const;

test('TC-LAUNCH-009 弱网首次打开不超过 30 秒', async ({ fresh, net }) => {
  test.setTimeout(12 * 60_000);
  const p = await net(WEAK);
  for (const [i, [id, name]] of SLOW.entries()) {
    await test.step(`${i + 1} ${name}：点「开始游戏」到游戏画面出现不超过 30 秒`, async () => {
      const page = await fresh();
      await openDetail(page, id, p.url);
      await p.idle();
      const t0 = await clickStart(page);
      // 等到出画面再判，超过 30 秒也留下实际耗时，登记时与旧版并排
      await waitPlayable(page, id, 120_000);
      const ms = Date.now() - t0;
      test.info().annotations.push({ type: '首开耗时', description: `${id} ${(ms / 1000).toFixed(1)} 秒` });
      expect(ms, id).toBeLessThanOrEqual(30_000);
      await page.context().close();
    });
  }
});

test('TC-LAUNCH-010 弱网再次打开不重新下载', async ({ fresh, net }) => {
  test.setTimeout(8 * 60_000);
  const p = await net(WEAK);

  // 前置：新浏览器经中转打开到游戏画面，退出回到详情页，等页面不再有请求；然后计时再开
  async function reopen(id: string) {
    const page = await fresh();
    await openDetail(page, id, p.url);
    await p.idle();
    await clickStart(page);
    await waitPlayable(page, id, 120_000);
    await exitGame(page, id);
    await p.idle();
    const hits = hitsOf(p, id).length, sent = launchEvents(p).length;
    const t0 = await clickStart(page);
    await waitPlayable(page, id, 30_000);
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: '再开耗时', description: `${id} ${(ms / 1000).toFixed(1)} 秒` });
    return { page, ms, newHits: hitsOf(p, id).length - hits, sent };
  }

  const first = await test.step('1 薯光：点「开始游戏」到游戏画面出现不超过 2 秒', async () => {
    const r = await reopen('spud-dawn');
    expect(r.ms).toBeLessThanOrEqual(2000);
    return r;
  });

  await test.step('2 第 1 步期间没有薯光游戏文件的请求', () => {
    expect(first.newHits).toBe(0);
  });

  await test.step('3 这次的 ready 带 c 为 1', async () => {
    await expect.poll(() => launchEvents(p).slice(first.sent).filter(e => e.g === 'spud-dawn' && e.p === 'ready').length).toBe(1);
    expect(launchEvents(p).slice(first.sent).find(e => e.g === 'spud-dawn' && e.p === 'ready')?.c).toBe(1);
    await first.page.context().close();
  });

  await test.step('4 我要当首富、斗罗·万相各做一遍：都不超过 2 秒，都没有游戏文件请求', async () => {
    for (const id of ['wealth-reborn', 'douluo']) {
      const r = await reopen(id);
      expect(r.ms, id).toBeLessThanOrEqual(2000);
      expect(r.newHits, id).toBe(0);
      await r.page.context().close();
    }
  });
});
