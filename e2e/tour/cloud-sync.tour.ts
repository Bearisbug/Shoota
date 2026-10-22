// TC-CLOUD-019 云同步走查（FLOW-CLOUD-SYNC S5），电脑 1440×900。
// 走查自己的云存档 S 写死在下面：开跑前删掉它上次留下的行，用接口开通并推上一克之差第 5 关，浏览器里预置同一份。
import { localCloud, openCloud, pushItem, skipGap, sync } from '../lib/cloud';
import { YIKE_LEVEL5, patchMeta, readCloud, statOf, writeCloud, writeSave } from '../lib/storage';
import { copy, exitGame, expectDetail, floatButton, panel, play } from '../lib/ui';
import { dropAccount, expect, shot, test } from './tour';

const S = '71017101710171017101710171017101', C = 'SYNC7Q2W4E6R8T0Y';
const SYNCED = /^已同步 · \d\d:\d\d$/;

test('TC-CLOUD-019 云同步走查', async ({ open, request }) => {
  dropAccount(S);
  expect((await openCloud(request, S, C)).status()).toBe(201);
  expect((await sync(request, S, { push: [pushItem('yike', YIKE_LEVEL5, { s: 600 })] })).json.results[0]).toMatchObject({ r: 'ok', rev: 1 });
  skipGap(S);
  const page = await open({ at: 'desktop' });
  await page.goto('/');
  await writeCloud(page, localCloud(S, C, { yike: { rev: 1, save: YIKE_LEVEL5 } }));
  await writeSave(page, 'yike', YIKE_LEVEL5);
  await patchMeta(page, m => { Object.assign(statOf(m, 'yike'), { seconds: 600, last: Date.now() - 24 * 3600_000 }); });

  await test.step('1 打开一克之差，画面出现后退出；再打开一克之差，点悬浮按钮：面板里云存档状态为「已同步 · 时:分」', async () => {
    await page.reload();
    await play(page, 'yike');
    await exitGame(page, 'yike');
    await expect.poll(async () => (await readCloud(page))?.games.yike?.rev ?? 0, { timeout: 15_000 }).toBe(2);
    await play(page, 'yike');
    await floatButton(page).click();
    await expect(panel(page).getByText(SYNCED)).toBeVisible();
    await shot(page, 'FLOW-CLOUD-SYNC/S5-a', { look: [panel(page).getByText(SYNCED)] });
  });

  await test.step('2 点「退出游戏」，打开存档页：云存档卡有四段恢复码、「上次同步 刚刚」、「复制恢复码」与「在这台设备输入恢复码」', async () => {
    await panel(page).getByRole('button', { name: copy.player.exit, exact: true }).click();
    await expectDetail(page, 'yike');
    await page.goto('/#backup');
    const last = page.getByText(`${copy.cloud.lastSync} 刚刚`, { exact: true });
    await expect(page.getByRole('img', { name: C.match(/.{4}/g)!.join('-'), exact: true })).toBeVisible();
    await expect(last).toBeVisible();
    await expect(page.getByRole('button', { name: copy.cloud.enterCode, exact: true })).toBeVisible();
    // 存档码里带导出时刻，每次运行内容与长度都不同
    await expect(page.locator('#bk-out')).toBeVisible();
    await shot(page, 'FLOW-CLOUD-SYNC/S5-b', {
      look: [last],
      dynamic: [
        { at: page.locator('#bk-out'), what: '存档码里带导出时刻，每次运行都不同' },
        { at: page.getByText(/^存档码共 /), what: '存档码的字符数随导出时刻的压缩结果变化' },
      ],
    });
  });
});
