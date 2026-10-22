// 旧单文件游戏的平台接口、假 localStorage 与旧版本机数据（docs/TEST.md §4「旧游戏兼容」），电脑视口。
import { gzipSync } from 'node:zlib';
import type { Frame, Page } from '@playwright/test';
import type { SavePackV1 } from '../src/shared';
import { expect, onlyOn, test } from './lib/fixtures';
import { YIKE_LEVEL5, idbVersion, oldMeta, readMeta, readSave, writeMeta, writeSave } from './lib/storage';
import { SAVE_STATE, copy, expectDetail, exitGame, frameText, openPanel, play, section, title, toast } from './lib/ui';

onlyOn('desktop');

const H = 3600_000;
const inGame = <T>(fr: Frame, js: string) => fr.evaluate(js) as Promise<T>;
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first();

test('TC-LEGACY-001 旧游戏的 Platform 接口', async ({ page }) => {
  let fr = await play(page, 'basketball-star');

  await test.step('1 读 Platform：version 1.0，game basketball-star，四个方法，对象被冻结', async () => {
    const p = await inGame<{ version: string; game: string; fns: string[]; frozen: boolean }>(fr, `({
      version: Platform.version, game: Platform.game.id, frozen: Object.isFrozen(Platform),
      fns: ['unlock', 'defineAchievements', 'setStatus', 'exit'].filter(k => typeof Platform[k] === 'function'),
    })`);
    expect(p).toEqual({ version: '1.0', game: 'basketball-star', frozen: true, fns: ['unlock', 'defineAchievements', 'setStatus', 'exit'] });
  });

  await test.step('2 定义并解锁测试成就：提示「解锁成就 · 篮球巨星」与「测试成就」，5.2 秒左右消失', async () => {
    await inGame(fr, `Platform.defineAchievements([{ key: 't1', name: '测试成就' }]); Platform.unlock('t1')`);
    const t0 = Date.now();
    const line1 = toast(page, copy.player.achievement(title('basketball-star')));
    await expect(line1).toBeVisible();
    await expect(page.getByText('测试成就', { exact: true }).first()).toBeVisible();
    await expect(line1).toBeHidden({ timeout: 8000 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4500);
    expect(Date.now() - t0).toBeLessThanOrEqual(6500);
  });

  await test.step('3 setStatus 后打开面板：游戏名下面显示「第 3 赛季」', async () => {
    await inGame(fr, `Platform.setStatus('第 3 赛季')`);
    const p = await openPanel(page);
    const name = (await p.getByText(title('basketball-star'), { exact: true }).first().boundingBox())!;
    const status = (await p.getByText('第 3 赛季', { exact: true }).boundingBox())!;
    expect(status.y).toBeGreaterThan(name.y);
    await page.keyboard.press('Escape');
  });

  await test.step('4 sessionStorage：写一个键，退出再开，两次读到的长度都是 undefined（同旧版），再开后读不到这个键', async () => {
    expect(await inGame<number | undefined>(fr, 'sessionStorage.length')).toBeUndefined();
    await inGame(fr, `sessionStorage.setItem('e2e', '1')`);
    await exitGame(page, 'basketball-star');
    fr = await play(page, 'basketball-star');
    expect(await inGame<number | undefined>(fr, 'sessionStorage.length')).toBeUndefined();
    expect(await inGame<string | null>(fr, `sessionStorage.getItem('e2e')`)).toBeNull();
  });

  await test.step('5 调用 Platform.exit()：回到详情页', async () => {
    await inGame(fr, 'Platform.exit()');
    await expectDetail(page, 'basketball-star');
  });

  await test.step('6 详情页成就区：测试成就已解锁', async () => {
    await expect(section(page, copy.game.achievements).getByRole('listitem').filter({ hasText: '测试成就' })).toContainText(copy.game.unlocked);
  });
});

test('TC-LEGACY-002 旧游戏的假 localStorage 与合并写入', async ({ page }) => {
  let fr = await play(page, 'yike');

  await test.step('1 连写 t=1、2、3：1.5 秒内本机存档 t 为 3，面板显示「已存档 时:分」', async () => {
    await inGame(fr, `localStorage.setItem('t', '1'); localStorage.setItem('t', '2'); localStorage.setItem('t', '3')`);
    await expect.poll(async () => (await readSave(page, 'yike'))?.t, { timeout: 1500 }).toBe('3');
    const p = await openPanel(page);
    await expect(p.getByText(SAVE_STATE).first()).toHaveText(/^已存档 \d\d:\d\d$/);
    await page.keyboard.press('Escape');
  });

  await test.step('2 removeItem 后立刻退出：本机存档里没有 t', async () => {
    await inGame(fr, `localStorage.removeItem('t')`);
    await exitGame(page, 'yike');
    expect(await readSave(page, 'yike')).not.toHaveProperty('t');
  });

  await test.step('3 再打开，读 yikezhicha.v2：不是 null', async () => {
    fr = await play(page, 'yike');
    expect(await inGame<string | null>(fr, `localStorage.getItem('yikezhicha.v2')`)).not.toBeNull();
  });
});

test('TC-LEGACY-003 旧版留下的本机数据与存档码在新版照常读', async ({ page, fresh }) => {
  const now = Date.now();
  await page.goto('/');
  await writeMeta(page, oldMeta({ yike: { seconds: 600, last: now - H } }, { wish: { local: ['douluo'] }, x: 1 }));
  await writeSave(page, 'yike', YIKE_LEVEL5);
  const pack: SavePackV1 = {
    v: 1, at: now, saves: { yike: YIKE_LEVEL5 }, stats: { yike: { seconds: 600, last: now - H, ach: {}, status: '' } }, wish: [], achDefs: {},
  };
  const cj1 = 'CJ1' + gzipSync(JSON.stringify(pack)).toString('base64');

  await test.step('1 刷新，打开游戏库：一克之差「10 分钟」「1 小时前」，斗罗·万相「愿望单」', async () => {
    await page.reload();
    await page.goto('/#library');
    const rows = page.getByRole('list', { name: copy.library.listLabel }).getByRole('listitem');
    const yike = rows.filter({ hasText: title('yike') });
    await expect(yike).toContainText('10 分钟');
    // 上次游玩不在列表行里，在选中这款后右边的详情里（「上次游玩」一项）
    await yike.getByRole('button').click();
    await expect(page.getByRole('definition').filter({ hasText: /^1 小时前$/ })).toBeVisible();
    await expect(rows.filter({ hasText: title('douluo') })).toContainText(copy.library.wished);
  });

  await test.step('2 打开一克之差：第 5 关', async () => {
    const fr = await play(page, 'yike');
    await expect.poll(() => frameText(fr)).toContain('第 5 关');
  });

  await test.step('3 退出后读平台元数据：x 仍为 1，sendLog 仍在', async () => {
    await exitGame(page, 'yike');
    const m = await readMeta(page);
    expect(m?.x).toBe(1);
    expect(m).toHaveProperty('sendLog');
  });

  await test.step('4 新浏览器粘贴 CJ1 存档码并确认：提示已恢复 1 款，本机一克之差存档是第 5 关那份', async () => {
    const b = await fresh();
    await b.goto('/#backup');
    await b.getByPlaceholder(copy.backup.placeholder).fill(cj1);
    await btn(b, copy.backup.restore).click();
    await btn(b, copy.backup.confirm).click();
    await expect(toast(b, copy.backup.restored(1))).toBeVisible();
    await expect.poll(() => readSave(b, 'yike')).toEqual(YIKE_LEVEL5);
  });

  await test.step('5 IndexedDB changju 的版本号仍为 1', async () => {
    expect(await idbVersion(page)).toBe(1);
  });
});
