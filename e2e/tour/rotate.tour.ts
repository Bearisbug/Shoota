// TC-PLAY-023 横竖屏切换走查（FLOW-ROTATE S1、S2、S4），iPhone Safari UA（不锁定方向），竖屏 393×852 开局后改成横屏 852×393。
// 一克之差偏好竖屏：预置「已提示过旋转」，横屏时不弹旋转提示；横屏的悬浮按钮位置预置在左边、游戏区高度的 0.3 处。
// S4 要改写后的一克之差（GameShell），目录里它的 runtime 还不是 play 时整条跳过，登记为阻塞。
import type { Frame } from '@playwright/test';
import { gameById } from '../../src/catalog';
import { UI_KEY, type UiPrefsV1 } from '../../src/shared';
import { YIKE_LEVEL5, writeSave } from '../lib/storage';
import { box, floatButton, gameFrame, play } from '../lib/ui';
import { IPHONE_UA } from '../lib/viewports';
import { expect, settleFloat, shot, test } from './tour';

const PREFS: UiPrefsV1 = { v: 1, float: { yike: { landscape: { side: 'left', y: 0.3 } } }, rotateHintSeen: { yike: 1 } };

test('TC-PLAY-023 横竖屏切换走查', async ({ open }) => {
  test.skip(gameById('yike')?.runtime !== 'play', '目录里一克之差的 runtime 还不是 play');
  const page = await open({ at: 'portrait', ua: IPHONE_UA });
  await page.goto('/');
  await writeSave(page, 'yike', YIKE_LEVEL5);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [UI_KEY, JSON.stringify(PREFS)] as const);
  const fr: Frame = await play(page, 'yike');
  await fr.evaluate(() => { (window as unknown as { __mark: number }).__mark = 1; });
  await settleFloat(page);
  const header = fr.locator('[data-shell="header"]'), toggle = header.locator('button[aria-expanded]');

  await test.step('1 视口改成 852×393：游戏 iframe 变成 852×393，游戏没有重新载入', async () => {
    await page.setViewportSize({ width: 852, height: 393 });
    await expect.poll(async () => { const b = await box(gameFrame(page, 'yike')); return [Math.round(b.width), Math.round(b.height)]; }).toEqual([852, 393]);
    expect(await fr.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(1);
    await expect(header).toHaveAttribute('data-collapsed', ''); // 等游戏按新方向排完再拍，后两步与这一张是同一帧
    await shot(page, 'FLOW-ROTATE/S1', { look: [gameFrame(page, 'yike')] });
  });

  await test.step('2 看悬浮按钮：在左边，离左边缘 8 像素，中心高度约 118', async () => {
    const b = await box(floatButton(page));
    expect(b.x).toBeCloseTo(8, 0);
    expect(Math.abs(b.y + b.height / 2 - 0.3 * 393)).toBeLessThanOrEqual(2);
    await shot(page, 'FLOW-ROTATE/S2', { look: [floatButton(page)], sameAs: 'FLOW-ROTATE/S1' });
  });

  await test.step('3 看一克之差的顶部信息区：收成一行，有展开按钮', async () => {
    await expect(header).toHaveAttribute('data-collapsed', '');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await shot(page, 'FLOW-ROTATE/S4', { look: [header], sameAs: 'FLOW-ROTATE/S1' });
  });
});
