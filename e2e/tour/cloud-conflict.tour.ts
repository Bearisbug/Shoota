// TC-CLOUD-020 冲突处理走查（FLOW-CLOUD-CONFLICT S3、S4），电脑 1440×900。
// 另一台设备用接口代替：云存档 S 上一克之差先到版本 3，再以 900 秒推一份第 4 关到版本 4；
// 这台浏览器记着版本 3、本机是第 2 关、累计 360 秒，下一次同步时输给云端那份，自己那份进撤销槽。
import type { Page } from '@playwright/test';
import { localCloud, openCloud, pushItem, skipGap, sync, yikeSave } from '../lib/cloud';
import { patchMeta, readSave, readUndo, statOf, writeCloud, writeSave } from '../lib/storage';
import { copy, loadAt, pattern, title, toast } from '../lib/ui';
import { dropAccount, expect, shot, test } from './tour';

const S = '71027102710271027102710271027102', C = 'CNFX7Q2W4E6R8T0Y';
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first();
const libraryRow = (page: Page, id: string) => page.getByRole('list', { name: copy.library.listLabel }).getByRole('listitem').filter({ hasText: title(id) });

test('TC-CLOUD-020 冲突处理走查', async ({ open, request }) => {
  dropAccount(S);
  expect((await openCloud(request, S, C)).status()).toBe(201);
  for (let i = 1; i <= 4; i++) {
    skipGap(S);
    const r = await sync(request, S, { push: [pushItem('yike', yikeSave(i, i === 4 ? 'B' : `v${i}`), { base: i - 1, s: i === 4 ? 900 : 300 })] });
    expect(r.json.results[0]).toMatchObject({ r: 'ok', rev: i });
  }
  skipGap(S);
  const mine = yikeSave(2, 'A');
  const page = await open({ at: 'desktop' });
  await page.goto('/#library');
  await writeCloud(page, localCloud(S, C, { yike: { rev: 3, hash: 'mismatch' } }));
  await writeSave(page, 'yike', mine);
  await patchMeta(page, m => { Object.assign(statOf(m, 'yike'), { seconds: 360, last: Date.now() }); });
  const replaced = toast(page, copy.cloud.replaced(copy.backup.titles([title('yike')])));

  await test.step('1 打开商店，等一次同步：提示「《一克之差》的存档换成了另一台设备上玩得更久的进度，可以在游戏库撤销。」，带「去游戏库」', async () => {
    await loadAt(page, '/#store');
    await expect(replaced).toBeVisible({ timeout: 15_000 });
    // 提示 3.6 秒后收起，先拍，下一步还要点它上面的「去游戏库」
    await shot(page, 'FLOW-CLOUD-CONFLICT/S3', { tap: [btn(page, copy.cloud.replacedAction)], look: [replaced] });
    expect(await readSave(page, 'yike')).toEqual(yikeSave(4, 'B'));
    expect((await readUndo(page, 'yike'))?.why).toBe('conflict');
  });

  await test.step('2 点「去游戏库」，点一克之差：显示「可撤销」、替换说明与「换回原来的进度」', async () => {
    await btn(page, copy.cloud.replacedAction).click();
    await expect(page).toHaveURL(/#library$/);
    await libraryRow(page, 'yike').click();
    await expect(page.getByText(copy.library.undoBadge, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(pattern(copy.library.undoConflict))).toBeVisible();
    await shot(page, 'FLOW-CLOUD-CONFLICT/S4-a', { tap: [btn(page, copy.library.undoAction)] });
  });

  await test.step('3 点「换回原来的进度」：提示「已换回原来的进度」，「可撤销」消失，本机换回第 2 关那份', async () => {
    await btn(page, copy.library.undoAction).click();
    await expect(toast(page, copy.library.undoDone)).toBeVisible();
    await expect(page.getByText(copy.library.undoBadge, { exact: true })).toHaveCount(0);
    expect(await readSave(page, 'yike')).toEqual(mine);
    await shot(page, 'FLOW-CLOUD-CONFLICT/S4-b', { look: [toast(page, copy.library.undoDone)] });
  });
});
