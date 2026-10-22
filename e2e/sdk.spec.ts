// SDK v2 与改写后的一克之差（docs/TEST.md §4「改写游戏」）。目录里一克之差的 runtime 不是 play 时整组跳过，登记为阻塞。
import type { Frame, Page } from '@playwright/test';
import { gameById } from '../src/catalog';
import { measureGame } from './lib/core-area';
import { installFaults, messages } from './lib/faults';
import { expect, onlyOn, test } from './lib/fixtures';
import { YIKE_LEVEL5, readSave, writeSave } from './lib/storage';
import { copy, expectDetail, exitGame, frameText, openPanel, panel, play } from './lib/ui';

test.skip(gameById('yike')?.runtime !== 'play', '目录里一克之差的 runtime 还不是 play');

const step1 = (fr: Frame) => fr.getByText('开始抓药', { exact: true }).click();
const shoota = (page: Page) => messages(page).then(ms => ms.filter(m => m.ns === 'shoota'));
const toggle = (fr: Frame) => fr.locator('[data-shell="header"] button[aria-expanded]');
const level = async (page: Page) => JSON.parse((await readSave(page, 'yike'))?.['yikezhicha.v2'] ?? '{}').level as number | undefined;

test.describe('电脑', () => {
  onlyOn('desktop');

  test('TC-SDK-001 改写游戏握手与存档', async ({ page, context }) => {
    await installFaults(context);
    let fr!: Frame;

    await test.step('1 打开一克之差：消息依次 hello（游戏发）、welcome（平台发）、ready（游戏发），信封 ns shoota、sdk 2', async () => {
      fr = await play(page, 'yike');
      const ms = (await shoota(page)).filter(m => ['hello', 'welcome', 'ready'].includes(m.type));
      expect(ms.map(m => [m.type, m.to])).toEqual([['hello', 'platform'], ['welcome', 'game'], ['ready', 'platform']]);
      expect(ms.every(m => m.sdk === 2)).toBe(true);
    });

    await test.step('2 点「开始抓药」：1.5 秒内本机存档更新，键仍是 yikezhicha.v2', async () => {
      const before = JSON.stringify(await readSave(page, 'yike'));
      await step1(fr);
      await expect.poll(async () => JSON.stringify(await readSave(page, 'yike')), { timeout: 1500 }).not.toBe(before);
      expect(Object.keys((await readSave(page, 'yike'))!)).toContain('yikezhicha.v2');
    });

    await test.step('3 打开游戏面板：「已存档」加当前时分', async () => {
      const p = await openPanel(page);
      await expect(p.getByText(/^已存档 \d\d:\d\d$/)).toBeVisible();
    });
  });

  test('TC-SDK-004 直接打开改写游戏的地址', async ({ page }) => {
    await page.goto('/');

    await test.step('1 直接打开 /play/yike/：1 秒内显示「请从 shoota.ai 打开」', async () => {
      await page.goto('/play/yike/');
      await expect(page.getByText('请从 shoota.ai 打开', { exact: true })).toBeVisible({ timeout: 1000 });
    });

    await test.step('2 回到平台读本机存档：没有一克之差的存档', async () => {
      await page.goto('/');
      expect(await readSave(page, 'yike')).toBeUndefined();
    });
  });

  test('TC-SDK-005 退出前等游戏收尾', async ({ page, context }) => {
    await installFaults(context);
    const fr = await play(page, 'yike');
    const before = JSON.stringify(await readSave(page, 'yike'));

    await test.step('1 推进一步后立刻退出：平台发 suspend，游戏回 suspended，1 秒内回到详情页', async () => {
      await step1(fr);
      const p = await openPanel(page);
      const t = Date.now();
      await p.getByRole('button', { name: copy.player.exit, exact: true }).click();
      await expectDetail(page, 'yike', 1000);
      expect(Date.now() - t).toBeLessThanOrEqual(1000);
      const ms = await shoota(page);
      const s = ms.findIndex(m => m.type === 'suspend' && m.to === 'game' && m.reason === 'exit');
      expect(s).toBeGreaterThanOrEqual(0);
      expect(ms.slice(s).some(m => m.type === 'suspended' && m.to === 'platform')).toBe(true);
    });

    await test.step('2 本机存档包含那一步的改动', async () => {
      expect(JSON.stringify(await readSave(page, 'yike'))).not.toBe(before);
    });

    await test.step('3 再打开，把页面可见状态置为隐藏：平台发出 suspend', async () => {
      await play(page, 'yike');
      const n = (await shoota(page)).length;
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect.poll(async () => (await shoota(page)).slice(n).some(m => m.type === 'suspend' && m.reason === 'hidden')).toBe(true);
    });
  });
});

test.describe('横屏', () => {
  onlyOn('landscape');
  test.use({ reducedMotion: 'reduce' });

  test('TC-SDK-002 GameShell 横屏折叠信息区', async ({ page, fresh }) => {
    let fr!: Frame;

    await test.step('1 852×393 打开一克之差：顶部信息区收成一行，有展开按钮', async () => {
      fr = await play(page, 'yike');
      await expect(fr.locator('[data-shell="header"]')).toHaveAttribute('data-collapsed', '');
      await expect(toggle(fr)).toHaveAttribute('aria-expanded', 'false');
    });

    await test.step('2 核心区占比不低于 60%', async () => {
      const r = await measureGame(page, fr, 'landscape', 'yike');
      expect(r.mode).toBe('shell');
      expect(r.coreAreaPct).toBeGreaterThanOrEqual(60);
    });

    await test.step('3 点展开，退出再打开：展开后显示全部信息，再打开仍是展开', async () => {
      await toggle(fr).click();
      await expect(toggle(fr)).toHaveAttribute('aria-expanded', 'true');
      await expect(fr.locator('[data-shell="header"]')).not.toHaveAttribute('data-collapsed', '');
      if (await panel(page).isVisible()) await page.keyboard.press('Escape');
      await exitGame(page, 'yike');
      fr = await play(page, 'yike');
      await expect(toggle(fr)).toHaveAttribute('aria-expanded', 'true');
    });

    await test.step('4 竖屏 393×852 打开：信息区不折叠', async () => {
      const pg = await fresh({ at: 'portrait' });
      const f = await play(pg, 'yike');
      await expect(toggle(f)).toHaveCount(0);
      await expect(f.locator('[data-shell="header"]')).not.toHaveAttribute('data-collapsed', '');
    });

    await test.step('5 Safari 横屏可见区 734×343：信息区收成一行，核心区占比不低于 55%', async () => {
      const pg = await fresh({ at: 'safari-landscape', reducedMotion: 'reduce' });
      const f = await play(pg, 'yike');
      await expect(toggle(f)).toHaveAttribute('aria-expanded', 'false');
      expect((await measureGame(pg, f, 'safari-landscape', 'yike')).coreAreaPct).toBeGreaterThanOrEqual(55);
    });
  });
});

test.describe('竖屏', () => {
  onlyOn('portrait');
  test.use({ reducedMotion: 'reduce' });

  test('TC-SDK-003 一克之差改写后接着玩', async ({ page }) => {
    await page.goto('/');
    await writeSave(page, 'yike', YIKE_LEVEL5);
    let fr!: Frame;

    await test.step('1 打开一克之差：第 5 关', async () => {
      fr = await play(page, 'yike');
      await expect.poll(() => frameText(fr)).toContain('第 5 关');
    });

    await test.step('2 核心区占比不低于 75%', async () => {
      expect((await measureGame(page, fr, 'portrait', 'yike')).coreAreaPct).toBeGreaterThanOrEqual(75);
    });

    await test.step('3 退出后读本机存档：键仍是 yikezhicha.v2，关卡不小于 5', async () => {
      await exitGame(page, 'yike');
      expect(Object.keys((await readSave(page, 'yike'))!)).toContain('yikezhicha.v2');
      expect(await level(page)).toBeGreaterThanOrEqual(5);
    });
  });
});
