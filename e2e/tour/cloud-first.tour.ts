// TC-CLOUD-018 首次上云走查（FLOW-CLOUD-FIRST S4），电脑 1440×900。
// 编号与恢复码由平台生成；走查页面的随机数固定了种子，两遍生成同一个恢复码。
import { dashed } from '../lib/cloud';
import { readCloud } from '../lib/storage';
import { copy, exitGame, play } from '../lib/ui';
import { expect, shot, test } from './tour';

test('TC-CLOUD-018 首次上云走查', async ({ open }) => {
  const page = await open({ at: 'desktop' });
  const btn = (name: string) => page.getByRole('button', { name, exact: true });

  await test.step('1 打开一克之差，画面出现后退出，回到商店：顶部提示「进度已经存到云端」，四段恢复码，「复制恢复码」与「知道了」', async () => {
    await play(page, 'yike');
    await exitGame(page, 'yike');
    await expect.poll(async () => (await readCloud(page))?.games.yike?.rev ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    const code = dashed((await readCloud(page))!.code);
    await page.goto('/#store');
    await expect(page.getByText(copy.cloud.noticeTitle, { exact: true })).toBeVisible();
    const shown = page.getByRole('img', { name: code, exact: true });
    await expect(shown).toBeVisible();
    await expect(btn(copy.cloud.noticeDismiss)).toBeVisible();
    await shot(page, 'FLOW-CLOUD-FIRST/S4', { tap: [btn(copy.cloud.copyCode)], look: [shown] });
  });
});
