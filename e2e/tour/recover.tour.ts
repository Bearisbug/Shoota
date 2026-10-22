// TC-CLOUD-021 换设备取回走查（FLOW-RECOVER S1、S3、S5），电脑 1440×900。
// 另一台设备用接口代替：云存档 S 里有一克之差（600 秒）与我要当首富（1500 秒）；这台浏览器是新的，本机没有进度。
import type { Page } from '@playwright/test';
import { dashed, openCloud, pushItem, sync } from '../lib/cloud';
import { YIKE_LEVEL5, readCloud } from '../lib/storage';
import { copy, title, toast } from '../lib/ui';
import { dropAccount, expect, shot, test } from './tour';

const S = '71037103710371037103710371037103', C = 'RCVR7Q2W4E6R8T0Y';
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const libraryRow = (page: Page, id: string) => page.getByRole('list', { name: copy.library.listLabel }).getByRole('listitem').filter({ hasText: title(id) });

test('TC-CLOUD-021 换设备取回走查', async ({ open, request }) => {
  dropAccount(S);
  expect((await openCloud(request, S, C)).status()).toBe(201);
  const r = await sync(request, S, { push: [pushItem('yike', YIKE_LEVEL5, { s: 600 }), pushItem('wealth-reborn', { 'e2e.tag': 'tour' }, { s: 1500 })] });
  expect(r.json.results.map(x => x.r)).toEqual(['ok', 'ok']);
  const page = await open({ at: 'desktop' });
  const input = page.getByPlaceholder(copy.recover.placeholder);

  await test.step('1 打开存档页，点「在这台设备输入恢复码」，输入四段恢复码', async () => {
    await page.goto('/#backup');
    await btn(page, copy.cloud.enterCode).click();
    await input.fill(dashed(C));
    await expect(input).toHaveValue(dashed(C));
    await shot(page, 'FLOW-RECOVER/S1', { tap: [btn(page, copy.recover.lookup)], look: [input] });
  });

  await test.step('2 点「查找」：显示「这份云存档里有 2 款游戏的进度：」，一克之差「云端 10 分钟」，我要当首富「云端 25 分钟」', async () => {
    await btn(page, copy.recover.lookup).click();
    const list = page.getByRole('list').filter({ hasText: copy.recover.cloudSide('10 分钟') });
    await expect(page.getByText(copy.recover.confirmIntro(2), { exact: true })).toBeVisible();
    await expect(list.getByRole('listitem').filter({ hasText: title('yike') })).toContainText(copy.recover.cloudSide('10 分钟'));
    await expect(list.getByRole('listitem').filter({ hasText: title('wealth-reborn') })).toContainText(copy.recover.cloudSide('25 分钟'));
    await shot(page, 'FLOW-RECOVER/S3', { tap: [btn(page, copy.recover.confirm)], look: [list] });
  });

  await test.step('3 点「确认取回」：跳到游戏库，提示「已取回 2 款游戏的进度」，游戏库有这两款', async () => {
    await btn(page, copy.recover.confirm).click();
    await expect(page).toHaveURL(/#library$/);
    const done = toast(page, copy.recover.done(2));
    await expect(done).toBeVisible();
    for (const id of ['yike', 'wealth-reborn']) await expect(libraryRow(page, id)).toHaveCount(1);
    await shot(page, 'FLOW-RECOVER/S5', { look: [done, libraryRow(page, 'yike'), libraryRow(page, 'wealth-reborn')] });
    expect((await readCloud(page))?.saveId).toBe(S);
  });
});
