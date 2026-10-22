// TC-LAUNCH-019 启动游戏走查（FLOW-LAUNCH S1、S2a、S4），竖屏 393×852，iPhone Safari UA（不自动全屏）。
// 进度条要停在中途才拍得稳：经本地中转打开，点开始前让中转先等 2.5 秒再回、游戏文件只发一半就停住；
// 拍完第 2 步改回照常转发，平台 10 秒没收到新字节后自动重试一次，第二次下载完整。
import { launchEvents, startProxy } from '../lib/proxy';
import { YIKE_LEVEL5, writeSave } from '../lib/storage';
import { clickStart, copy, floatButton, gameFrame, loading, openDetail, platformControls, progress, progressBar, title, waitPlayable } from '../lib/ui';
import { IPHONE_UA } from '../lib/viewports';
import { expect, settleFloat, shot, test } from './tour';

test('TC-LAUNCH-019 启动游戏走查', async ({ open }) => {
  const p = await startProxy();
  try {
    const page = await open({ at: 'portrait', ua: IPHONE_UA, via: p.url });
    await page.goto('/');
    await writeSave(page, 'yike', YIKE_LEVEL5);
    await openDetail(page, 'yike');
    await p.idle();
    Object.assign(p, { latencyMs: 2500, mode: 'stall' });

    await test.step('1 点「开始游戏」：载入页有一克之差的封面与名称、进度条与「退出」，进度为 0', async () => {
      await clickStart(page);
      await expect(loading(page)).toBeVisible();
      await expect(page.getByText(title('yike'), { exact: true }).locator('visible=true').first()).toBeVisible();
      await expect(page.getByRole('button', { name: copy.launch.exit, exact: true })).toBeVisible();
      expect(await progress(page)).toBe(0);
      await shot(page, 'FLOW-LAUNCH/S1', { look: [progressBar(page), page.getByText(title('yike'), { exact: true }).locator('visible=true').first()] });
      await expect.poll(() => launchEvents(p).filter(e => e.g === 'yike' && e.p === 'start').length).toBe(1);
    });

    await test.step('2 等进度条走到一半左右停住', async () => {
      await expect.poll(() => progress(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(40);
      expect(await progress(page)).toBeLessThanOrEqual(60);
      await shot(page, 'FLOW-LAUNCH/S2a', { look: [progressBar(page)] });
    });

    await test.step('3 中转改回照常转发，等游戏画面出现：载入页消失，只剩游戏画面与「游戏菜单」悬浮按钮，上报就绪', async () => {
      Object.assign(p, { latencyMs: 0, mode: 'pass' });
      await waitPlayable(page, 'yike', 45_000);
      await expect(loading(page)).toBeHidden();
      expect((await platformControls(page)).map(c => c.name)).toEqual([copy.player.floatLabel]);
      await expect.poll(() => launchEvents(p).filter(e => e.g === 'yike' && e.p === 'ready').length).toBe(1);
      await settleFloat(page);
      await shot(page, 'FLOW-LAUNCH/S4', { look: [gameFrame(page, 'yike'), floatButton(page)] });
    });
  } finally {
    await p.close();
  }
});
