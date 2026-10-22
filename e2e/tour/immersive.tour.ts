// TC-PLAY-022 沉浸与全屏走查（FLOW-IMMERSIVE S1～S6），电脑 1440×900：面板里有「全屏」按钮，无头 Edge 能进出全屏。
import type { Page } from '@playwright/test';
import { YIKE_LEVEL5, patchMeta, statOf, writeSave } from '../lib/storage';
import { box, clickStart, copy, expectDetail, extra, floatButton, gameFrame, openDetail, panel, platformControls, title, waitPlayable } from '../lib/ui';
import { expect, settleFloat, shot, test } from './tour';

const panelButton = (page: Page, name: string) => panel(page).getByRole('button', { name, exact: true });

test('TC-PLAY-022 沉浸与全屏走查', async ({ open }) => {
  const page = await open({ at: 'desktop' });
  await page.goto('/');
  await writeSave(page, 'yike', YIKE_LEVEL5);
  await patchMeta(page, m => { Object.assign(statOf(m, 'yike'), { seconds: 600, last: Date.now() - 24 * 3600_000 }); });
  await openDetail(page, 'yike');

  await test.step('1 点「开始游戏」，等游戏画面出现：游戏 iframe 铺满 1440×900，平台控件只有「游戏菜单」悬浮按钮', async () => {
    await clickStart(page);
    await waitPlayable(page, 'yike');
    const b = await box(gameFrame(page, 'yike'));
    expect([b.x, b.y, b.width, b.height].map(Math.round)).toEqual([0, 0, 1440, 900]);
    expect((await platformControls(page)).map(c => c.name)).toEqual([copy.player.floatLabel]);
    // 存档小点灭掉后，把指针移进按钮再移开，按钮重新计 3 秒，这一张拍到不透明的按钮
    await expect(floatButton(page)).not.toHaveAttribute('data-dot', 'on', { timeout: 5000 });
    await floatButton(page).hover();
    await page.mouse.move(720, 450);
    await expect(floatButton(page)).not.toHaveAttribute('data-idle');
    await shot(page, 'FLOW-IMMERSIVE/S1', { look: [gameFrame(page, 'yike')] });
  });

  await test.step('2 不碰屏幕等 4 秒：悬浮按钮贴在右边，变淡', async () => {
    await settleFloat(page);
    const b = await box(floatButton(page));
    expect(1440 - (b.x + b.width)).toBeCloseTo(8, 0);
    expect(await floatButton(page).evaluate(el => Number(getComputedStyle(el).opacity))).toBeCloseTo(0.4, 1);
    await shot(page, 'FLOW-IMMERSIVE/S2', { look: [floatButton(page)] });
  });

  await test.step('3 按住悬浮按钮拖到 (60, 300) 松手：按钮贴到左边', async () => {
    const b = await box(floatButton(page));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(60, 300, { steps: 12 });
    await page.mouse.up();
    await page.mouse.move(720, 450);
    await expect.poll(async () => (await box(floatButton(page))).x).toBeCloseTo(8, 0);
    await shot(page, 'FLOW-IMMERSIVE/S3', { tap: [floatButton(page)] });
  });

  await test.step('4 点悬浮按钮：在按钮旁弹出「游戏菜单」面板，有游戏名、存档状态、云存档状态、本次时长、「全屏」与「退出游戏」', async () => {
    await floatButton(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByText(title('yike'), { exact: true })).toBeVisible();
    await expect(panel(page).getByText(copy.player.elapsed(0), { exact: true })).toBeVisible();
    await expect(panelButton(page, copy.player.exit)).toBeVisible();
    await shot(page, 'FLOW-IMMERSIVE/S4', { tap: [panelButton(page, copy.player.fullscreen)] });
  });

  await test.step('5 点「全屏」：页面进入全屏，面板里的按钮变成「退出全屏」', async () => {
    await panelButton(page, copy.player.fullscreen).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(panelButton(page, extra.exitFullscreen)).toBeVisible();
    await shot(page, 'FLOW-IMMERSIVE/S5', { tap: [panelButton(page, copy.player.exit)] });
  });

  await test.step('6 点「退出游戏」：先退出全屏，再回到一克之差详情页', async () => {
    await panelButton(page, copy.player.exit).click();
    await expectDetail(page, 'yike');
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await shot(page, 'FLOW-IMMERSIVE/S6', { look: [page.getByRole('heading', { level: 1, name: title('yike') })] });
  });
});
