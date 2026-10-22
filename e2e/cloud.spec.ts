// 云存档：开通、同步、恢复码、冲突与撤销、1 MB 上限、到期删除（docs/TEST.md §4「云存档」），电脑视口。
// 接口直调用 Playwright 的 request（baseURL 为 8812），编号、恢复码与摘要的写法见 e2e/lib/cloud.ts。
import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { APIRequestContext, Page } from '@playwright/test';
import type { CloudGamePush, CloudSyncBody, GameSave } from '../src/shared';
import {
  CODE_DASHED, auth, cloudAccount, cloudGame, dashed, localCloud, newCode, newSaveId, openCloud, pushItem, recordCloud, resultOf,
  sidOf, skipGap, sync, syncCalls, pushedGames, yikeSave, type CloudCall,
} from './lib/cloud';
import { CLOUD_TABLES, LAUNCH_TABLES, STAT_TABLES, bjDay, clearTables, count, d1 } from './lib/d1';
import { expect, onlyOn, sleep, test } from './lib/fixtures';
import {
  YIKE_LEVEL5, patchMeta, readCloud, readMeta, readSave, readUndo, statOf, writeCloud, writeSave, writeUndo,
} from './lib/storage';
import { copy, exitGame, extra, frameText, hhmm, loadAt, openPanel, panel, pattern, play, startGame, title, toast, waitPlayable } from './lib/ui';

onlyOn('desktop');
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const D = 24 * 3600_000;
const SYNC_WAIT = 75_000; // 每分钟同步一次，多留 15 秒
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first();
const codeInput = (page: Page) => page.getByPlaceholder(copy.recover.placeholder);
const libraryRow = (page: Page, id: string) => page.getByRole('list', { name: copy.library.listLabel }).getByRole('listitem').filter({ hasText: title(id) });
const bodyOf = (p: { enc: string; body: string }) => JSON.parse(p.enc === 'gz64' ? gunzipSync(Buffer.from(p.body, 'base64')).toString('utf8') : p.body) as GameSave;
const pushOf = (c: CloudCall, g: string) => (c.req as CloudSyncBody | null)?.push.find(p => p.g === g);

// 页面发出的 /api/cloud/sync 请求（含没拿到响应的），按发出时间
function sentSyncs(page: Page) {
  const at: number[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/cloud/sync') at.push(Date.now()); });
  return at;
}

// 等到 since 之后出现一次满足条件的同步
async function nextSync(calls: CloudCall[], since: number, ok: (c: CloudCall) => boolean = () => true, timeout = SYNC_WAIT) {
  await expect.poll(() => syncCalls(calls, since).some(ok), { timeout }).toBe(true);
  return syncCalls(calls, since).find(ok)!;
}

// 打开一克之差再退出，等云存档开通并推上 yike
async function openedCloud(page: Page, base = '') {
  await play(page, 'yike', base);
  await exitGame(page, 'yike');
  await expect.poll(async () => (await readCloud(page))?.games.yike?.rev ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  return (await readCloud(page))!;
}

// 存档页点「在这台设备输入恢复码」，输入后点「查找」
async function lookup(page: Page, code: string) {
  if (!await codeInput(page).isVisible()) {
    await page.goto('/#backup');
    await btn(page, copy.cloud.enterCode).click();
  }
  await codeInput(page).fill(code);
  await btn(page, copy.recover.lookup).click();
}

// 用接口开通 S 并把一克之差推到第 n 版，每次内容不同；返回各版内容
async function cloudWithYike(request: APIRequestContext, n: number, o: Partial<CloudGamePush> = {}) {
  const S = newSaveId(), C = newCode();
  expect((await openCloud(request, S, C)).status()).toBe(201);
  const saves: GameSave[] = [];
  for (let i = 1; i <= n; i++) {
    skipGap(S);
    const s = yikeSave(i, `v${i}`);
    const r = await sync(request, S, { push: [pushItem('yike', s, { base: i - 1, ...o })] });
    expect(r.json.results.find(x => x.g === 'yike')).toMatchObject({ r: 'ok', rev: i });
    saves.push(s);
  }
  return { S, C, saves };
}

test('TC-CLOUD-001 第一次存下进度后开通云存档', async ({ page, net }) => {
  clearTables(...STAT_TABLES, ...LAUNCH_TABLES, ...CLOUD_TABLES);
  const p = await net(); // 照常转发，只为记下 /api/e 与 /api/launch 的正文（含 sendBeacon）
  const calls = recordCloud(page);
  let st = null as Awaited<ReturnType<typeof readCloud>>;

  await test.step('1 打开一克之差再退出：5 秒内开通返回 201，随后同步推上 yike，ok、版本 1', async () => {
    // 一克之差打开就写一次存档，开通与第一次同步可能在退出之前就发出，所以从打开前开始算
    const t = Date.now();
    await play(page, 'yike', p.url);
    await exitGame(page, 'yike');
    await expect.poll(() => calls.some(c => c.path === '/api/cloud/account' && c.status === 201), { timeout: 5000 }).toBe(true);
    // 开通之后才会同步，从打开前算起找推上 yike 的那次；不能先截一份 calls，截下时同步的回应可能还没到
    const s = await nextSync(calls, t, c => pushedGames(c).includes('yike'), 5000);
    expect(resultOf(s, 'yike')).toMatchObject({ r: 'ok', rev: 1 });
  });

  await test.step('2 changju.cloud.v1：saveId 32 位小写十六进制，恢复码 16 位，yike 版本 1', async () => {
    st = await readCloud(page);
    expect(st?.saveId).toMatch(/^[0-9a-f]{32}$/);
    expect(st?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(st?.games.yike?.rev).toBe(1);
  });

  await test.step('3 回到商店：顶部提示「进度已经存到云端」，四段恢复码，「复制恢复码」与「知道了」', async () => {
    await page.goto(p.url + '/#store');
    await expect(page.getByText(copy.cloud.noticeTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: dashed(st!.code), exact: true })).toBeVisible();
    await expect(btn(page, copy.cloud.copyCode)).toBeVisible();
    await expect(btn(page, copy.cloud.noticeDismiss)).toBeVisible();
  });

  await test.step('4 点「知道了」后刷新：提示不再出现', async () => {
    await btn(page, copy.cloud.noticeDismiss).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: copy.store.all })).toBeVisible();
    await expect(page.getByText(copy.cloud.noticeTitle, { exact: true })).toHaveCount(0);
  });

  await test.step('5 cloud_accounts、cloud_games 各 1 行；sid 是 saveId 的 SHA-256，三张表找不到原文', async () => {
    const sid = sidOf(st!.saveId);
    expect(count('cloud_accounts', `sid = '${sid}'`)).toBe(1);
    expect(count('cloud_games', `sid = '${sid}'`)).toBe(1);
    expect(count('cloud_accounts')).toBe(1);
    for (const t of CLOUD_TABLES) {
      const dump = JSON.stringify(d1(`SELECT * FROM ${t}`));
      expect(dump, t).not.toContain(st!.saveId);
      expect(dump, t).not.toContain(st!.code);
    }
  });

  await test.step('6 统计表、启动表与 /api/e、/api/launch 的正文里都没有 saveId', async () => {
    for (const t of [...STAT_TABLES.filter(x => x !== 'login_guards'), ...LAUNCH_TABLES]) {
      expect(JSON.stringify(d1(`SELECT * FROM ${t}`)), t).not.toContain(st!.saveId);
    }
    const bodies = p.apiPosts.filter(x => x.path === '/api/e' || x.path === '/api/launch');
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b.body, b.path).not.toContain(st!.saveId);
  });
});

test('TC-CLOUD-002 存档页的云存档卡与三处说明', async ({ page }) => {
  clearTables(...CLOUD_TABLES);

  await test.step('1 #backup：「玩过之后会自动开通」，说明是旧版文案', async () => {
    await page.goto('/#backup');
    await expect(page.getByText(copy.cloud.notYet, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.backup.intro, { exact: true })).toBeVisible();
  });

  let st = null as Awaited<ReturnType<typeof readCloud>>;
  await test.step('2 开通后回到 #backup：四段恢复码、复制按钮、上次同步、输入恢复码入口；说明换成云存档文案', async () => {
    st = await openedCloud(page);
    await page.goto('/#backup');
    await expect(page.getByRole('img', { name: dashed(st.code), exact: true })).toBeVisible();
    await expect(btn(page, copy.cloud.copyCode)).toBeVisible();
    await expect(page.getByText(copy.cloud.lastSync).first()).toBeVisible();
    await expect(btn(page, copy.cloud.enterCode)).toBeVisible();
    await expect(page.getByText(copy.backup.introCloud, { exact: true })).toBeVisible();
  });

  await test.step('3 点「复制恢复码」：提示已复制，剪贴板里是带连字符的四段', async () => {
    await btn(page, copy.cloud.copyCode).click();
    await expect(toast(page, copy.cloud.codeCopied)).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(CODE_DASHED);
  });

  await test.step('4 商店底部说明带：「进度自动存到云端」与正文', async () => {
    await page.goto('/#store');
    await expect(page.getByRole('heading', { name: copy.store.bandTitleCloud })).toBeVisible();
    await expect(page.getByText(copy.store.bandTextCloud, { exact: true })).toBeVisible();
  });

  await test.step('5 游戏库点一克之差，「关于存档」换成云存档文案', async () => {
    await page.goto('/#library');
    await libraryRow(page, 'yike').click();
    await expect(page.getByRole('main')).toContainText(copy.library.aboutTextCloud(title('yike')).join(''));
  });
});

test('TC-CLOUD-003 退出游戏与每分钟同步', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  clearTables(...CLOUD_TABLES);
  const st = await openedCloud(page);
  const calls = recordCloud(page);
  let syncedAt = 0;

  await test.step('1 我要当首富建立玩家「张三」：面板显示「已存档 时:分」', async () => {
    const fr = await play(page, 'wealth-reborn');
    await fr.locator('input').first().fill('张三');
    await fr.locator('button.gold-button').first().click();
    await expect.poll(async () => {
      const p = await openPanel(page);
      const t = await p.getByText(/^已存档 \d\d:\d\d$/).count();
      await page.keyboard.press('Escape');
      return t;
    }, { timeout: 10_000 }).toBeGreaterThan(0);
  });

  await test.step('2 点「退出游戏」：2 秒内一次同步推上 wealth-reborn，ok', async () => {
    const t = Date.now();
    await exitGame(page, 'wealth-reborn');
    const s = await nextSync(calls, t, c => pushedGames(c).includes('wealth-reborn'), 2000);
    expect(resultOf(s, 'wealth-reborn')?.r).toBe('ok');
    syncedAt = s.at;
  });

  await test.step('3 再开我要当首富：面板里云存档状态「已同步 · 时:分」，为第 2 步的时间', async () => {
    await play(page, 'wealth-reborn');
    const p = await openPanel(page);
    await expect(p.getByText(extra.cloudSynced(hhmm(new Date(syncedAt))), { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await test.step('4 退出后停在商店 70 秒：至少一次同步', async () => {
    await exitGame(page, 'wealth-reborn');
    await page.goto('/#store');
    const t = Date.now();
    await sleep(70_000);
    expect(syncCalls(calls, t).length).toBeGreaterThan(0);
  });

  await test.step('5 cloud_games 里 wealth-reborn 的秒数等于本机累计秒数', async () => {
    const m = (await readMeta(page))!;
    const local = m.stats[m.session?.email ?? 'local']?.['wealth-reborn']?.seconds;
    expect(cloudGame(st.saveId, 'wealth-reborn')?.seconds).toBe(local);
  });
});

test('TC-CLOUD-004 离线时攒到联网再传', async ({ page, context }) => {
  clearTables(...CLOUD_TABLES);
  await openedCloud(page);
  skipGap((await readCloud(page))!.saveId);
  const calls = recordCloud(page), sent = sentSyncs(page);

  await test.step('1 打开一克之差，切到离线，打开面板：「离线，联网后同步」', async () => {
    await play(page, 'yike');
    await context.setOffline(true);
    const p = await openPanel(page);
    await expect(p.getByText(extra.cloudOffline, { exact: true })).toBeVisible();
  });

  let t = 0;
  await test.step('2 离线时退出，停 5 秒：没有发出同步', async () => {
    await panel(page).getByRole('button', { name: copy.player.exit, exact: true }).click();
    t = Date.now();
    await sleep(5000);
    expect(sent.filter(x => x >= t)).toEqual([]);
  });

  await test.step('3 恢复联网：5 秒内一次同步推上 yike，ok', async () => {
    const t1 = Date.now();
    await context.setOffline(false);
    const s = await nextSync(calls, t1, c => pushedGames(c).includes('yike'), 5000);
    expect(resultOf(s, 'yike')?.r).toBe('ok');
  });
});

test('TC-CLOUD-005 同一份内容重推不加版本号', async ({ request, fresh }) => {
  clearTables(...CLOUD_TABLES);
  const { S, C, saves } = await cloudWithYike(request, 3);
  skipGap(S);
  const before = cloudGame(S, 'yike');

  await test.step('1 同一份内容、base 3 再推：200，yike ok、rev 3', async () => {
    const r = await sync(request, S, { push: [pushItem('yike', saves[2], { base: 3 })] });
    expect(r.status).toBe(200);
    expect(r.json.results.find(x => x.g === 'yike')).toMatchObject({ r: 'ok', rev: 3 });
  });

  await test.step('2 cloud_games：rev 3，updated_at 与第 1 步之前相同', () => {
    const after = cloudGame(S, 'yike');
    expect(after.rev).toBe(3);
    expect(after.updated_at).toBe(before.updated_at);
  });

  const page = await fresh();
  await test.step('3 新浏览器写 S、C（yike 版本 2）与版本 3 的内容，打开商店：70 秒内拉回版本 3', async () => {
    await page.goto('/');
    await writeCloud(page, localCloud(S, C, { yike: { rev: 2, save: saves[2] } }));
    await writeSave(page, 'yike', saves[2]);
    await page.goto('/#store');
    await page.reload();
    await expect.poll(async () => (await readCloud(page))?.games.yike?.rev, { timeout: SYNC_WAIT }).toBe(3);
  });

  await test.step('4 撤销槽为空，没有「换成了另一台设备上玩得更久的进度」的提示', async () => {
    expect(await readUndo(page, 'yike')).toBeUndefined();
    await expect(page.getByText(pattern(copy.cloud.replaced))).toHaveCount(0);
  });
});

test('TC-CLOUD-006 换设备用恢复码取回', async ({ page: a, fresh }) => {
  test.setTimeout(5 * 60_000);
  clearTables(...CLOUD_TABLES);
  const st = await openedCloud(a);
  const fr = await play(a, 'wealth-reborn');
  await fr.locator('input').first().fill('张三');
  await fr.locator('button.gold-button').first().click();
  await sleep(1500);
  await exitGame(a, 'wealth-reborn');
  await expect.poll(async () => (await readCloud(a))?.games['wealth-reborn']?.rev ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const b = await fresh();

  await test.step('1 B 输入 A 的恢复码查找：确认页「这份云存档里有 2 款游戏的进度：」，列出两款与云端时长', async () => {
    await lookup(b, st.code);
    await expect(b.getByText(copy.recover.confirmIntro(2), { exact: true })).toBeVisible();
    for (const id of ['yike', 'wealth-reborn']) await expect(b.getByText(title(id), { exact: true }).first()).toBeVisible();
    await expect(b.getByText(/^云端 /)).toHaveCount(2);
  });

  await test.step('2 点「确认取回」：跳到游戏库，提示已取回 2 款，游戏库有这两款', async () => {
    await btn(b, copy.recover.confirm).click();
    await expect(b).toHaveURL(/#library$/);
    await expect(toast(b, copy.recover.done(2))).toBeVisible();
    for (const id of ['yike', 'wealth-reborn']) await expect(libraryRow(b, id)).toHaveCount(1);
  });

  await test.step('3 B 的两款存档与 A 的相同，saveId 与 A 的相同', async () => {
    for (const id of ['yike', 'wealth-reborn']) expect(await readSave(b, id), id).toEqual(await readSave(a, id));
    expect((await readCloud(b))?.saveId).toBe(st.saveId);
  });

  await test.step('4 B 打开我要当首富：读到「张三」', async () => {
    const f = await play(b, 'wealth-reborn');
    await expect.poll(() => frameText(f)).toContain('张三');
    await exitGame(b, 'wealth-reborn');
  });

  await test.step('5 B 打开一克之差再退出：推上 yike，云端版本号加 1', async () => {
    skipGap(st.saveId);
    const rev = cloudGame(st.saveId, 'yike').rev;
    await play(b, 'yike');
    await exitGame(b, 'yike');
    await expect.poll(() => cloudGame(st.saveId, 'yike').rev, { timeout: 15_000 }).toBe(rev + 1);
  });

  await test.step('6 A 停在商店 70 秒：拉回新版本，与 B 的存档相同', async () => {
    await a.goto('/#store');
    const want = await readSave(b, 'yike');
    await expect.poll(() => readSave(a, 'yike'), { timeout: SYNC_WAIT }).toEqual(want);
  });

  await test.step('7 cloud_accounts 的 recover_n 为 1', () => {
    expect(cloudAccount(st.saveId).recover_n).toBe(1);
  });
});

test('TC-CLOUD-007 恢复码输入规整与错误提示', async ({ request, page, context, fresh }) => {
  clearTables(...CLOUD_TABLES);
  const S = newSaveId(), C = '01ABCDEFGHJKMNPQ';
  expect((await openCloud(request, S, C)).status()).toBe(201);
  await sync(request, S, { push: [pushItem('yike', yikeSave(1))] });
  const asked: string[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/cloud/recover') asked.push((r.postDataJSON() as { code: string }).code); });
  const back = () => btn(page, copy.recover.back).click();

  await test.step('1 15 位：提示「恢复码是 16 位…」，没有请求', async () => {
    await lookup(page, '01ABCDEFGHJKMNP');
    await expect(page.getByText(copy.recover.errLength, { exact: true })).toBeVisible();
    expect(asked).toEqual([]);
  });

  await test.step('2 「01ab-cdef ghjk-mnpq」：请求里的 code 规整成 01ABCDEFGHJKMNPQ，进入确认页', async () => {
    await lookup(page, '01ab-cdef ghjk-mnpq');
    await expect(page.getByText(copy.recover.confirmIntro(1), { exact: true })).toBeVisible();
    expect(asked.at(-1)).toBe(C);
  });

  await test.step('3 「OLAB-CDEF-GHJK-MNPQ」：O 当 0、L 当 1', async () => {
    await back();
    await lookup(page, 'OLAB-CDEF-GHJK-MNPQ');
    await expect(page.getByText(copy.recover.confirmIntro(1), { exact: true })).toBeVisible();
    expect(asked.at(-1)).toBe(C);
  });

  await test.step('4 「ZZZZ-ZZZZ-ZZZZ-ZZZZ」：输入框标红，「没找到这个恢复码，核对后再试」', async () => {
    await back();
    await lookup(page, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    await expect(page.getByText(copy.recover.errUnknown, { exact: true })).toBeVisible();
    await expect(codeInput(page)).toHaveAttribute('aria-invalid', 'true');
  });

  await test.step('5 离线时查找：「网络不通，连上网再试」，停在输入框', async () => {
    await context.setOffline(true);
    await lookup(page, C);
    await expect(page.getByText(copy.recover.errNetwork, { exact: true })).toBeVisible();
    await expect(codeInput(page)).toBeVisible();
    await context.setOffline(false);
  });

  await test.step('6 联网后进入确认页点「取消」：回到存档页，本机没有云存档状态，没有一克之差存档', async () => {
    await lookup(page, C);
    await expect(page.getByText(copy.recover.confirmIntro(1), { exact: true })).toBeVisible();
    await btn(page, copy.recover.cancel).click();
    await expect(page.getByRole('heading', { name: copy.backup.title })).toBeVisible();
    expect(await readCloud(page)).toBeNull();
    expect(await readSave(page, 'yike')).toBeUndefined();
  });

  await test.step('7 已在用 S、C 的浏览器输入 C：「这台设备已经在用这个恢复码…」', async () => {
    const pg = await fresh();
    await pg.goto('/');
    await writeCloud(pg, localCloud(S, C));
    await pg.reload();
    await lookup(pg, C);
    await expect(pg.getByText(copy.recover.sameCode, { exact: true })).toBeVisible();
  });
});

test('TC-CLOUD-008 恢复链接只弹确认', async ({ request, page }) => {
  clearTables(...CLOUD_TABLES);
  const S = newSaveId(), C = newCode();
  await openCloud(request, S, C);
  await sync(request, S, { push: [pushItem('yike', yikeSave(1))] });
  const sent = sentSyncs(page);

  await test.step('1 打开 /#recover=<C>：弹出「用恢复码取回进度」，恢复码已填好', async () => {
    await page.goto(`/#recover=${C}`);
    await expect(page.getByRole('heading', { name: copy.recover.title })).toBeVisible();
    expect((await codeInput(page).inputValue()).replace(/[^0-9A-Z]/gi, '').toUpperCase()).toBe(C);
  });

  await test.step('2 等 5 秒：没有同步，本机没有云存档状态与一克之差存档', async () => {
    await sleep(5000);
    expect(sent).toEqual([]);
    expect(await readCloud(page)).toBeNull();
    expect(await readSave(page, 'yike')).toBeUndefined();
  });

  await test.step('3 走到「确认取回」并点它：跳到游戏库，有一克之差，saveId 为 S', async () => {
    await btn(page, copy.recover.lookup).click();
    await btn(page, copy.recover.confirm).click();
    await expect(page).toHaveURL(/#library$/);
    await expect(libraryRow(page, 'yike')).toHaveCount(1);
    expect((await readCloud(page))?.saveId).toBe(S);
  });
});

test('TC-CLOUD-009 取回时本机已有进度与另一个云存档', async ({ request, page: b }) => {
  test.setTimeout(4 * 60_000);
  clearTables(...CLOUD_TABLES);
  const S = newSaveId(), C = newCode();
  await openCloud(request, S, C);
  await sync(request, S, { push: [pushItem('yike', YIKE_LEVEL5, { s: 600 })] });
  const T = await openedCloud(b);
  await patchMeta(b, m => { statOf(m, 'yike').seconds = 60; });
  const mine = await readSave(b, 'yike');
  const calls = recordCloud(b);
  let tConfirm = 0;

  await test.step('1 B 输入 C 查找：一克之差「云端 10 分钟，这台设备 1 分钟」，另两句说明', async () => {
    await b.reload();
    await lookup(b, C);
    await expect(b.getByText(copy.recover.bothSides('10 分钟', '1 分钟'), { exact: true })).toBeVisible();
    await expect(b.getByText(copy.recover.keepLonger, { exact: true })).toBeVisible();
    await expect(b.getByText(copy.recover.switchAccount, { exact: true })).toBeVisible();
  });

  await test.step('2 点「确认取回」：本机换成第 5 关那份，撤销槽是原来那份、why 为 recover', async () => {
    tConfirm = Date.now();
    await btn(b, copy.recover.confirm).click();
    await expect.poll(() => readSave(b, 'yike')).toEqual(YIKE_LEVEL5);
    const u = await readUndo(b, 'yike');
    expect(u?.save).toEqual(mine);
    expect(u?.why).toBe('recover');
  });

  await test.step('3 saveId 换成 S，之后的同步请求头为 Save <S>', async () => {
    expect((await readCloud(b))?.saveId).toBe(S);
    expect(S).not.toBe(T.saveId);
    const s = await nextSync(calls, tConfirm);
    expect(s.auth).toBe(auth(S).authorization);
  });

  await test.step('4 游戏库点一克之差：「可撤销」与「…取回云存档时换成了云端的进度。」', async () => {
    await b.goto('/#library');
    await libraryRow(b, 'yike').click();
    await expect(b.getByText(copy.library.undoBadge, { exact: true }).first()).toBeVisible();
    await expect(b.getByText(pattern(copy.library.undoRecover))).toBeVisible();
  });
});

test.describe('TC-CLOUD-010', () => {
  // 前置：S 上一克之差到版本 3；A、B 都记着版本 3 但摘要对不上，各有一份不同的存档与累计秒数
  async function setup(request: APIRequestContext, fresh: (o?: object) => Promise<Page>, aSec: number, bSec: number) {
    clearTables(...CLOUD_TABLES);
    const { S, C } = await cloudWithYike(request, 3, { s: 300 });
    skipGap(S);
    const make = async (sec: number, save: GameSave) => {
      const pg = await fresh();
      await pg.goto('/#library');
      await writeCloud(pg, localCloud(S, C, { yike: { rev: 3, hash: 'mismatch' } }));
      await writeSave(pg, 'yike', save);
      await patchMeta(pg, m => { Object.assign(statOf(m, 'yike'), { seconds: sec, last: Date.now() }); });
      return { pg, save, calls: recordCloud(pg) };
    };
    return { S, a: await make(aSec, yikeSave(2, 'A')), b: await make(bSec, yikeSave(4, 'B')) };
  }

  test('TC-CLOUD-010 两台设备进度冲突', async ({ request, fresh }) => {
    test.setTimeout(6 * 60_000);
    let { S, a, b } = await setup(request, fresh, 360, 900);

    await test.step('1 A 打开商店：推 yike（base 3）ok，云端版本 4', async () => {
      const t = Date.now();
      await loadAt(a.pg, '/#store');
      const s = await nextSync(a.calls, t, c => pushedGames(c).includes('yike'));
      expect(pushOf(s, 'yike')?.base).toBe(3);
      expect(resultOf(s, 'yike')).toMatchObject({ r: 'ok', rev: 4 });
    });

    await test.step('2 跳过间隔，B 打开商店：推 yike（base 3）ok，云端版本 5、秒数 900、beat_rev 4', async () => {
      skipGap(S);
      const t = Date.now();
      await loadAt(b.pg, '/#store');
      const s = await nextSync(b.calls, t, c => pushedGames(c).includes('yike'));
      expect(pushOf(s, 'yike')?.base).toBe(3);
      expect(resultOf(s, 'yike')).toMatchObject({ r: 'ok', rev: 5 });
      expect(cloudGame(S, 'yike')).toMatchObject({ rev: 5, seconds: 900, beat_rev: 4 });
    });

    await test.step('3 A 等下一次同步：拉回版本 5，本机换成 B 的那份，撤销槽是 A 原来那份（conflict），有替换提示', async () => {
      await expect.poll(() => readSave(a.pg, 'yike'), { timeout: SYNC_WAIT }).toEqual(b.save);
      const u = await readUndo(a.pg, 'yike');
      expect(u?.save).toEqual(a.save);
      expect(u?.why).toBe('conflict');
      await expect(a.pg.getByText(copy.cloud.replaced(copy.backup.titles([title('yike')])), { exact: true })).toBeVisible();
    });

    await test.step('4 A 打开游戏库：一克之差旁边显示「可撤销」', async () => {
      await a.pg.goto('/#library');
      await expect(libraryRow(a.pg, 'yike')).toContainText(copy.library.undoBadge);
    });

    await test.step('5 反过来 A 900 秒、B 360 秒：B 推的结果 kept-cloud，云端仍是版本 4；B 换成 A 的那份，撤销槽是 B 原来那份', async () => {
      await a.pg.context().close();
      await b.pg.context().close();
      ({ S, a, b } = await setup(request, fresh, 900, 360));
      let t = Date.now();
      await loadAt(a.pg, '/#store');
      await nextSync(a.calls, t, c => resultOf(c, 'yike')?.r === 'ok');
      skipGap(S);
      t = Date.now();
      await loadAt(b.pg, '/#store');
      const s = await nextSync(b.calls, t, c => pushedGames(c).includes('yike'));
      expect(resultOf(s, 'yike')?.r).toBe('kept-cloud');
      expect(cloudGame(S, 'yike').rev).toBe(4);
      await expect.poll(() => readSave(b.pg, 'yike')).toEqual(a.save);
      expect((await readUndo(b.pg, 'yike'))?.save).toEqual(b.save);
    });
  });
});

test('TC-CLOUD-011 撤销被替换的存档', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  clearTables(...CLOUD_TABLES);
  const st = await openedCloud(page);
  skipGap(st.saveId);
  await writeUndo(page, 'yike', { save: YIKE_LEVEL5, stat: null, at: Date.now() - 3 * D, why: 'conflict' });
  const calls = recordCloud(page);
  const rev = cloudGame(st.saveId, 'yike').rev;
  let t = 0;

  await test.step('1 游戏库点一克之差：「可撤销」、替换说明与「换回原来的进度」', async () => {
    await loadAt(page, '/#library');
    await libraryRow(page, 'yike').click();
    await expect(page.getByText(copy.library.undoBadge, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(pattern(copy.library.undoConflict))).toBeVisible();
    await expect(btn(page, copy.library.undoAction)).toBeVisible();
  });

  await test.step('2 点「换回原来的进度」：提示已换回，本机变成第 5 关，撤销槽清空，「可撤销」消失', async () => {
    t = Date.now();
    await btn(page, copy.library.undoAction).click();
    await expect(toast(page, copy.library.undoDone)).toBeVisible();
    expect(await readSave(page, 'yike')).toEqual(YIKE_LEVEL5);
    expect(await readUndo(page, 'yike')).toBeUndefined();
    await expect(page.getByText(copy.library.undoBadge, { exact: true })).toHaveCount(0);
  });

  await test.step('3 随后的同步：yike 带 force，ok；云端版本加 1，内容是第 5 关那份', async () => {
    const s = await nextSync(calls, t, c => pushedGames(c).includes('yike'));
    const pushed = pushOf(s, 'yike')!;
    expect(pushed.force).toBe(true);
    expect(resultOf(s, 'yike')?.r).toBe('ok');
    expect(bodyOf(pushed)).toEqual(YIKE_LEVEL5);
    const row = cloudGame(st.saveId, 'yike');
    expect(row.rev).toBe(rev + 1);
    expect(row.body).toBe(pushed.body);
  });

  await test.step('4 撤销槽写成 31 天前，刷新后打开游戏库：不显示「可撤销」，撤销槽被删掉', async () => {
    await writeUndo(page, 'yike', { save: YIKE_LEVEL5, stat: null, at: Date.now() - 31 * D, why: 'conflict' });
    await page.reload();
    await page.goto('/#library');
    await libraryRow(page, 'yike').click();
    await expect(page.getByText(copy.library.undoBadge, { exact: true })).toHaveCount(0);
    await expect.poll(() => readUndo(page, 'yike')).toBeUndefined();
  });
});

test('TC-CLOUD-012 存档超过 1 MB 不上云', async ({ page, request }) => {
  test.setTimeout(4 * 60_000);
  clearTables(...CLOUD_TABLES);
  const st = await openedCloud(page);
  skipGap(st.saveId);
  // 随机字节压缩不了：原文约 1.2 MB，gzip 后 base64 仍有约 1.21 MB（RULE-CLOUD-002 按上传编码后的正文算）
  await writeSave(page, 'hougong', { 'hougong.big': randomBytes(900_000).toString('base64') });
  await patchMeta(page, m => { statOf(m, 'hougong').last = Date.now(); });
  await writeSave(page, 'yike', { ...(await readSave(page, 'yike')), 'e2e.tag': 'changed' });
  const calls = recordCloud(page);
  const rev = cloudGame(st.saveId, 'yike').rev;
  // 原文正好 n 字节的存档：{"k":"xxx…"} 比 x 的个数多 8 字节
  const ofBytes = (n: number): GameSave => ({ k: 'x'.repeat(n - 8) });

  await test.step('1 打开商店等一次同步：没有 hougong 的行，yike 版本加 1', async () => {
    const t = Date.now();
    await loadAt(page, '/#store');
    await nextSync(calls, t, c => resultOf(c, 'yike')?.r === 'ok');
    expect(cloudGame(st.saveId, 'hougong')).toBeUndefined();
    expect(cloudGame(st.saveId, 'yike').rev).toBe(rev + 1);
  });

  await test.step('2 打开后宫生死簿，点悬浮按钮：面板里写存档太大', async () => {
    await play(page, 'hougong');
    const p = await openPanel(page);
    await expect(p.getByText(copy.player.tooBig, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await exitGame(page, 'hougong');
  });

  await test.step('3 #backup：云存档卡里后宫生死簿标着存档太大', async () => {
    await page.goto('/#backup');
    await expect(page.getByText(copy.cloud.tooBig, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(title('hougong')).first()).toBeVisible();
  });

  await test.step('4 推一款原文 1,048,577 字节的存档：200，too-big，没有这一行', async () => {
    const r = await sync(request, st.saveId, { push: [pushItem('lol', ofBytes(1_048_577))] });
    expect(r.status).toBe(200);
    expect(r.json.results.find(x => x.g === 'lol')?.r).toBe('too-big');
    expect(cloudGame(st.saveId, 'lol')).toBeUndefined();
  });

  await test.step('5 跳过间隔，推正好 1,048,576 字节：ok，bytes 为 1048576', async () => {
    skipGap(st.saveId);
    const r = await sync(request, st.saveId, { push: [pushItem('lol', ofBytes(1_048_576))] });
    expect(r.json.results.find(x => x.g === 'lol')?.r).toBe('ok');
    expect(cloudGame(st.saveId, 'lol')?.bytes).toBe(1_048_576);
  });
});

test('TC-CLOUD-013 365 天没同步的云存档被删后重新开通', async ({ page, request }) => {
  test.setTimeout(4 * 60_000);
  clearTables(...CLOUD_TABLES);
  const st = await openedCloud(page);
  const R = newSaveId();
  await openCloud(request, R, newCode());
  const ago = (sid: string, n: number) => d1(`UPDATE cloud_accounts SET seen_day = date('now','+8 hours','-${n} days') WHERE sid = '${sid}'`);
  ago(sidOf(st.saveId), 366);
  ago(sidOf(R), 365);
  const calls = recordCloud(page);

  await test.step('1 触发到期删除任务：三张表没有 S 的行，R 还在', async () => {
    expect((await request.get('/__scheduled?cron=0+20+*+*+*')).ok()).toBe(true);
    for (const t of CLOUD_TABLES) expect(count(t, `sid = '${sidOf(st.saveId)}'`), t).toBe(0);
    expect(cloudAccount(R)).toBeTruthy();
  });

  await test.step('2 停在商店等下一次同步：404 cloud-not-found，随后同编号同恢复码开通 201，再推上 yike', async () => {
    const t = Date.now();
    await page.goto('/#store');
    const gone = await nextSync(calls, t, c => c.status === 404);
    expect((gone.res as { type?: string }).type).toBe('/errors/cloud-not-found');
    await expect.poll(() => calls.some(c => c.path === '/api/cloud/account' && c.at >= gone.at && c.status === 201), { timeout: 15_000 }).toBe(true);
    const acc = calls.find(c => c.path === '/api/cloud/account' && c.at >= gone.at)!;
    expect(acc.auth).toBe(auth(st.saveId).authorization);
    expect((acc.req as { code: string }).code).toBe(st.code);
    await nextSync(calls, acc.at, c => resultOf(c, 'yike')?.r === 'ok', 15_000);
  });

  await test.step('3 S 重新有一行，seen_day 为今天；有 S 的 yike 行', () => {
    expect(cloudAccount(st.saveId)?.seen_day).toBe(bjDay());
    expect(cloudGame(st.saveId, 'yike')).toBeTruthy();
  });
});

test('TC-CLOUD-014 云存档凭据不对时停止同步', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  clearTables(...CLOUD_TABLES);
  await openedCloud(page);
  // 凭据不对的情形用 Playwright 拦下同步、回 401 cloud-auth 来造：大写编号在本机就被认作坏数据，到不了接口
  await page.route('**/api/cloud/sync', r => r.fulfill({
    status: 401, contentType: 'application/problem+json',
    body: JSON.stringify({ type: '/errors/cloud-auth', title: 'cloud auth', status: 401, instance: '/api/cloud/sync' }),
  }));
  const calls = recordCloud(page), sent = sentSyncs(page);

  await test.step('1 刷新等一次同步：401，type 为 /errors/cloud-auth', async () => {
    const t = Date.now();
    await page.reload();
    const s = await nextSync(calls, t);
    expect(s.status).toBe(401);
    expect((s.res as { type?: string }).type).toBe('/errors/cloud-auth');
  });

  await test.step('2 #backup：云存档卡写「云存档暂停同步了…」', async () => {
    await page.goto('/#backup');
    await expect(page.getByText(copy.cloud.stopped, { exact: true })).toBeVisible();
  });

  await test.step('3 打开一克之差，点悬浮按钮：「云存档暂时不可用」', async () => {
    await play(page, 'yike');
    const p = await openPanel(page);
    await expect(p.getByText(extra.cloudStopped, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await test.step('4 退出后停在商店 70 秒：没有再发同步', async () => {
    await exitGame(page, 'yike');
    await page.goto('/#store');
    const t = Date.now();
    await sleep(70_000);
    expect(sent.filter(x => x >= t)).toEqual([]);
  });
});

test('TC-CLOUD-015 两个标签页同时开通', async ({ page, context }) => {
  clearTables(...CLOUD_TABLES);
  const tabs = [page, await context.newPage()];
  await Promise.all(tabs.map(p => p.goto('/#game-yike')));
  await Promise.all(tabs.map(p => expect(p.getByRole('heading', { level: 1, name: title('yike') })).toBeVisible()));

  await test.step('1 两个标签页同时开始、画面出现后同时退出：都回到详情页', async () => {
    await Promise.all(tabs.map(p => startGame(p, 'yike').then(() => waitPlayable(p, 'yike'))));
    await Promise.all(tabs.map(p => exitGame(p, 'yike')));
  });

  await test.step('2 10 秒后：cloud_accounts 只有 1 行，两个标签页的 saveId 与恢复码相同', async () => {
    await sleep(10_000);
    expect(count('cloud_accounts')).toBe(1);
    const [x, y] = await Promise.all(tabs.map(readCloud));
    expect(x?.saveId).toMatch(/^[0-9a-f]{32}$/);
    expect([y?.saveId, y?.code]).toEqual([x?.saveId, x?.code]);
  });
});

test('TC-CLOUD-016 同步拉回正在玩的游戏', async ({ page: a, fresh }) => {
  test.setTimeout(4 * 60_000);
  clearTables(...CLOUD_TABLES);
  const st = await openedCloud(a);
  const shared = (await readSave(a, 'yike'))!;
  const b = await fresh();
  // B 的云存档请求先扣住，A 推上版本 2 之后再放行：一克之差一打开就改存档，不扣住的话 B 可能先推，版本 2 成了 B 自己的那份
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await b.route('**/api/cloud/**', async r => { await gate; await r.fallback(); });
  await b.goto('/');
  await writeCloud(b, localCloud(st.saveId, st.code, { yike: { rev: 1, save: shared } }));
  await writeSave(b, 'yike', shared);
  await b.reload();
  // B 在游戏里点「开始抓药」，让 B 自己的那份与 A 接下来推上去的版本 2 不同，第 2 步才分得出是谁的
  const bf = await play(b, 'yike');
  const bOwn = JSON.stringify(await readSave(b, 'yike'));
  await bf.getByText('开始抓药', { exact: true }).click();
  await expect.poll(async () => JSON.stringify(await readSave(b, 'yike'))).not.toBe(bOwn);

  await test.step('1 A 打开一克之差再退出：推上 yike，云端版本 2', async () => {
    skipGap(st.saveId);
    await play(a, 'yike');
    await exitGame(a, 'yike');
    await expect.poll(() => cloudGame(st.saveId, 'yike').rev, { timeout: 15_000 }).toBe(2);
  });
  const v2 = cloudGame(st.saveId, 'yike').body;
  release();

  await test.step('2 B 留在游戏里 70 秒：本机一克之差仍是 B 自己的，没有换成版本 2', async () => {
    await sleep(70_000);
    expect(JSON.stringify(await readSave(b, 'yike'))).not.toBe(v2);
    expect(await readSave(b, 'yike')).not.toEqual(await readSave(a, 'yike'));
  });
});

test('TC-CLOUD-017 时长相同时留改档时间更晚的那份', async ({ request }) => {
  clearTables(...CLOUD_TABLES);
  const T = Date.now() - 60_000;
  const { S } = await cloudWithYike(request, 2, { s: 300, at: T });
  const push = async (n: number, o: Partial<CloudGamePush>, skip = true) => {
    if (skip) skipGap(S);
    const r = await sync(request, S, { have: { yike: 1 }, push: [pushItem('yike', yikeSave(10 + n, `step${n}`), { base: 1, s: 300, at: T, ...o })] });
    return { res: r.json.results.find(x => x.g === 'yike')!, pull: r.json.pull };
  };

  await test.step('1 base 1、300 秒、改档时间 T+1000：ok，rev 3，beat_rev 2', async () => {
    expect((await push(1, { at: T + 1000 })).res).toMatchObject({ r: 'ok', rev: 3 });
    expect(cloudGame(S, 'yike').beat_rev).toBe(2);
  });

  await test.step('2 base 1、300 秒、改档时间 T：kept-cloud，rev 3，pull 里有版本 3', async () => {
    const r = await push(2, {});
    expect(r.res).toMatchObject({ r: 'kept-cloud', rev: 3 });
    expect(r.pull.find(x => x.g === 'yike')?.rev).toBe(3);
  });

  await test.step('3 base 1、200 秒：kept-cloud，rev 3', async () => {
    expect((await push(3, { s: 200 })).res).toMatchObject({ r: 'kept-cloud', rev: 3 });
  });

  await test.step('4 base 1、200 秒、带 force：ok，rev 4，beat_rev 3', async () => {
    expect((await push(4, { s: 200, force: true })).res).toMatchObject({ r: 'ok', rev: 4 });
    expect(cloudGame(S, 'yike').beat_rev).toBe(3);
  });

  await test.step('5 不跳过间隔，base 4 再推一份：too-soon，rev 4', async () => {
    expect((await push(5, { base: 4 }, false)).res).toMatchObject({ r: 'too-soon', rev: 4 });
  });
});
