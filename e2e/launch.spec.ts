// 启动：分段超时、自动重试、失败页、读档失败与启动上报（docs/TEST.md §4「启动」）。
// 弱网与卡住都由本地中转造（e2e/lib/proxy.ts），启动上报从中转记下的 /api/launch 正文里读；电脑视口，不自动全屏。
// 关掉 Service Worker，免得缓存里的游戏文件绕过中转的模式。
import type { Page } from '@playwright/test';
import { gameById } from '../src/catalog';
import { YIKE_LEVEL5, readMeta, readSave, writeSave } from './lib/storage';
import { LAUNCH_TABLES, STAT_TABLES, bjDay, clearTables, d1 } from './lib/d1';
import { installFaults, setFaults } from './lib/faults';
import { expect, onlyOn, sleep, test } from './lib/fixtures';
import { GAME_FILE, WEAK, hitsOf, launchEvents, syncPosts, type NetProxy } from './lib/proxy';
import {
  clickStart, copy, exitButton, expectDetail, exitGame, failPage, failReason, firstSeen, floatButton, gameFrame, loading, openDetail, platformControls,
  progress, progressBar, retryButton, retrying, startControl, startGame, title, waitPlayable,
} from './lib/ui';

onlyOn('desktop');
test.use({ serviceWorkers: 'block' });

const evOf = (p: NetProxy, g: string) => launchEvents(p).filter(e => e.g === g);
const phases = (p: NetProxy, g: string) => evOf(p, g).map(e => e.p);
const left = (t0: number, ms: number) => Math.max(1, ms - (Date.now() - t0));
const launchDay = (g: string, env = 'browser') => d1<{ starts: number; ready: number; fail: number; cancel: number; b1: number; b3: number; b10: number; b30: number; bx: number }>(
  `SELECT SUM(starts) AS starts, SUM(ready) AS ready, SUM(fail) AS fail, SUM(cancel) AS cancel, SUM(b1) AS b1, SUM(b3) AS b3, SUM(b10) AS b10, SUM(b30) AS b30, SUM(bx) AS bx
   FROM launch_days WHERE day = '${bjDay()}' AND game = '${g}' AND env = '${env}'`)[0];
const failsToday = (why: string) => d1<{ n: number | null }>(`SELECT SUM(n) AS n FROM launch_fails WHERE day = '${bjDay()}' AND reason = '${why}'`)[0].n ?? 0;

// 失败页：标题、原因文案、重试与退出
async function expectFailPage(page: Page, why: Parameters<typeof failReason>[1], timeout: number) {
  await expect(failPage(page)).toBeVisible({ timeout });
  await expect(failReason(page, why)).toBeVisible();
  await expect(retryButton(page)).toBeVisible();
  await expect(exitButton(page)).toBeVisible();
}

async function lastFail(p: NetProxy, g: string, why: string) {
  await expect.poll(() => evOf(p, g).filter(e => e.p === 'fail').length).toBeGreaterThan(0);
  expect(evOf(p, g).filter(e => e.p === 'fail').at(-1)?.why).toBe(why);
}

test('TC-LAUNCH-002 打开游戏到可玩并上报开始与就绪', async ({ page }) => {
  clearTables(...STAT_TABLES, ...LAUNCH_TABLES);
  // 本地取游戏文件太快，推迟 1.5 秒让载入页看得清
  await page.route(u => GAME_FILE.test(u.pathname), async r => { await sleep(1500); await r.continue(); });
  const g = gameById('yike')!;

  await test.step('1 打开一克之差详情，点「开始游戏」：载入页有封面、名称、进度条与「退出」', async () => {
    await startGame(page, 'yike');
    await expect(progressBar(page)).toBeVisible();
    await expect(page.locator(`img[src$="${g.cover}"]`).locator('visible=true').first()).toBeVisible();
    await expect(page.getByText(title('yike'), { exact: true }).locator('visible=true').first()).toBeVisible();
    await expect(exitButton(page)).toBeVisible();
  });

  await test.step('2 10 秒内载入页消失，只剩游戏画面与悬浮按钮', async () => {
    await waitPlayable(page, 'yike', 10_000);
    await expect(progressBar(page)).toBeHidden();
    await expect(floatButton(page)).toBeVisible();
    expect((await platformControls(page)).map(c => c.name)).toEqual([copy.player.floatLabel]);
  });

  await test.step('3 2 秒后 launch_days：开始 1、就绪 1，五个耗时分桶里只有一格为 1', async () => {
    await expect.poll(() => launchDay('yike')?.ready ?? 0, { timeout: 5000 }).toBe(1);
    const r = launchDay('yike');
    expect(r.starts).toBe(1);
    expect([r.b1, r.b3, r.b10, r.b30, r.bx].sort()).toEqual([0, 0, 0, 0, 1]);
  });

  await test.step('4 game_days：这个旅客今天 yike 开局 1 次', async () => {
    const vid = (await readMeta(page))?.vid;
    expect(vid).toMatch(/^[0-9a-f]{32}$/);
    expect(d1<{ starts: number }>(`SELECT starts FROM game_days WHERE vid = '${vid}' AND game = 'yike' AND day = '${bjDay()}'`)[0]?.starts).toBe(1);
  });
});

test('TC-LAUNCH-003 下载中途卡住后自动重试', async ({ page, net }) => {
  const p = await net({ ...WEAK, mode: 'stall-once' });
  await openDetail(page, 'douluo', p.url);
  await p.idle();
  let t0 = 0;

  await test.step('1 点「开始游戏」：进度条走到 40% 到 60% 之间停住', async () => {
    t0 = await clickStart(page);
    await expect.poll(() => progress(page), { timeout: 40_000 }).toBeGreaterThanOrEqual(40);
    // 走到 40% 时可能还在下，等到隔 2 秒两次读数相同才算停住，再看停在哪
    let a = await progress(page);
    await expect.poll(async () => { const was = a; await sleep(2000); a = await progress(page); return a === was; }, { timeout: 20_000, intervals: [0] }).toBe(true);
    expect(a).toBeGreaterThanOrEqual(40);
    expect(a).toBeLessThanOrEqual(60);
  });

  await test.step('2 停住后再等 12 秒：出现重试提示，中转记到第二次斗罗文件请求', async () => {
    await expect(retrying(page)).toBeVisible({ timeout: 12_000 });
    expect(hitsOf(p, 'douluo').length).toBe(2);
  });

  await test.step('3 最多到点击后第 60 秒，游戏画面出现', async () => {
    await waitPlayable(page, 'douluo', left(t0, 60_000));
  });

  await test.step('4 启动上报：start 一条、ready 一条且 n 为 2，没有 fail', async () => {
    await expect.poll(() => phases(p, 'douluo')).toContain('ready');
    expect(phases(p, 'douluo')).toEqual(['start', 'ready']);
    expect(evOf(p, 'douluo').find(e => e.p === 'ready')?.n).toBe(2);
  });
});

test('TC-LAUNCH-004 重试后仍卡住显示失败页', async ({ page, net }) => {
  clearTables(...LAUNCH_TABLES);
  const p = await net({ mode: 'stall' });
  await openDetail(page, 'douluo', p.url);
  let t0 = 0;

  await test.step('1 点「开始游戏」：进度条停在一半左右', async () => {
    t0 = await clickStart(page);
    await expect.poll(() => progress(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(40);
    expect(await progress(page)).toBeLessThanOrEqual(60);
  });

  await test.step('2 到点击后第 15 秒：显示重试提示', async () => {
    await expect(retrying(page)).toBeVisible({ timeout: left(t0, 15_000) });
  });

  await test.step('3 到点击后第 30 秒：失败页，原因「网络不太稳，游戏没下载完，可以重试」', async () => {
    await expectFailPage(page, 'net-stall', left(t0, 30_000));
  });

  await test.step('4 一条 fail，原因 net-stall；launch_fails 今天 net-stall 为 1', async () => {
    await lastFail(p, 'douluo', 'net-stall');
    await expect.poll(() => failsToday('net-stall'), { timeout: 5000 }).toBe(1);
  });
});

test('TC-LAUNCH-005 两次都等不到首字节显示失败页', async ({ page, net }) => {
  const p = await net({ mode: 'hang' });
  await openDetail(page, 'yike', p.url);
  let t0 = 0;

  await test.step('1 点「开始游戏」：出现「正在载入游戏…」', async () => {
    t0 = await clickStart(page);
    await expect(loading(page)).toBeVisible();
  });

  await test.step('2 到点击后第 20 秒：显示重试提示，中转记到两次一克之差文件请求', async () => {
    await expect(retrying(page)).toBeVisible({ timeout: left(t0, 20_000) });
    await expect.poll(() => hitsOf(p, 'yike').length, { timeout: left(t0, 20_000) }).toBe(2);
  });

  await test.step('3 到点击后第 35 秒：失败页', async () => {
    await expectFailPage(page, 'net-timeout', left(t0, 35_000));
  });

  await test.step('4 一条 fail，原因 net-timeout', () => lastFail(p, 'yike', 'net-timeout'));
});

test('TC-LAUNCH-006 游戏迟迟不就绪', async ({ page, net }) => {
  await installFaults(page, { dropReady: true });
  const p = await net(); // 不限速，只为记下启动上报
  await openDetail(page, 'yike', p.url);
  let t0 = 0, sawRetry = 0;

  await test.step('1 点「开始游戏」：出现载入页', async () => {
    t0 = await clickStart(page);
    await expect(loading(page)).toBeVisible();
  });

  await test.step('2 到点击后第 10 秒：仍是载入页', async () => {
    sawRetry = await firstSeen(retrying(page), t0, 10_000);
    await expect(loading(page)).toBeVisible();
  });

  await test.step('3 到点击后第 20 秒：失败页「游戏没能启动，可以重试一次」；没出现过重试提示，一克之差文件只请求了一次', async () => {
    while (!await failPage(page).isVisible() && Date.now() - t0 < 20_000) {
      if (!sawRetry && await retrying(page).isVisible()) sawRetry = Date.now() - t0;
      await page.waitForTimeout(200);
    }
    await expectFailPage(page, 'boot-timeout', 1000);
    expect(sawRetry, '出现过「网络不太稳，正在重试…」').toBe(0);
    expect(hitsOf(p, 'yike')).toHaveLength(1);
  });

  await test.step('4 一条 fail，原因 boot-timeout', () => lastFail(p, 'yike', 'boot-timeout'));
});

test.describe('读档失败', () => {
  // 写好第 5 关的存档后刷新一次，平台开通云存档、推完一次再打开开关
  async function prepare(page: Page, p: NetProxy) {
    await installFaults(page);
    await openDetail(page, 'yike', p.url);
    await writeSave(page, 'yike', YIKE_LEVEL5);
    await page.reload();
    await p.idle();
  }

  test('TC-LAUNCH-007 本机存档读不出来时不开局、不写回', async ({ page, net }) => {
    const p = await net();
    await prepare(page, p);
    await setFaults(page, { idb: 'hang' });
    const tOn = Date.now();
    let t0 = 0;

    await test.step('1 点「继续游戏」：出现载入页', async () => {
      t0 = await clickStart(page);
      await expect(loading(page)).toBeVisible();
    });

    await test.step('2 到点击后第 6 秒：仍是载入页，没有游戏画面', async () => {
      await sleep(left(t0, 6000));
      await expect(loading(page)).toBeVisible();
      await expect(gameFrame(page, 'yike')).toHaveCount(0);
    });

    await test.step('3 到点击后第 12 秒：失败页「这台设备的存档读不出来…」，页面上没有一克之差的 iframe', async () => {
      await expectFailPage(page, 'save-timeout', left(t0, 12_000));
      await expect(gameFrame(page, 'yike')).toHaveCount(0);
    });

    await test.step('4 一条 fail，原因 save-timeout', () => lastFail(p, 'yike', 'save-timeout'));

    await test.step('5 开关打开后发出的 /api/cloud/sync 推送里没有 yike', async () => {
      const pushed = syncPosts(p).filter(x => x.at >= tOn).flatMap(x => (JSON.parse(x.body) as { push?: { g: string }[] }).push ?? []).map(x => x.g);
      expect(pushed).not.toContain('yike');
    });

    await test.step('6 关掉开关，刷新后读一克之差的本机存档：仍是第 5 关那份', async () => {
      await setFaults(page, { idb: 'off' });
      await page.reload();
      expect(await readSave(page, 'yike')).toEqual(YIKE_LEVEL5);
    });
  });

  test('TC-LAUNCH-008 存档库报错时不开局', async ({ page, net }) => {
    const p = await net();
    await prepare(page, p);
    await setFaults(page, { idb: 'error' });

    await test.step('1 点「继续游戏」：10 秒内失败页「这台设备的存档读不出来…」', async () => {
      await clickStart(page);
      await expectFailPage(page, 'save-error', 10_000);
    });

    await test.step('2 一条 fail，原因 save-error', () => lastFail(p, 'yike', 'save-error'));

    await test.step('3 关掉开关，刷新后读一克之差的本机存档：仍是第 5 关那份', async () => {
      await setFaults(page, { idb: 'off' });
      await page.reload();
      expect(await readSave(page, 'yike')).toEqual(YIKE_LEVEL5);
    });
  });
});

test('TC-LAUNCH-011 同一款游戏不重开', async ({ page, net }) => {
  const p = await net({ bytesPerSec: WEAK.bytesPerSec });
  await openDetail(page, 'douluo', p.url);
  await p.idle();

  await test.step('1 在「开始游戏」上连点两下：只出现一个载入页', async () => {
    await startControl(page).dblclick();
    await expect(loading(page)).toHaveCount(1);
  });

  await test.step('2 等游戏画面出现：中转只记到一次斗罗文件请求', async () => {
    await waitPlayable(page, 'douluo', 60_000);
    expect(hitsOf(p, 'douluo')).toHaveLength(1);
  });

  await test.step('3 start 只有一条', async () => {
    await expect.poll(() => phases(p, 'douluo')).toContain('ready');
    expect(phases(p, 'douluo').filter(x => x === 'start')).toHaveLength(1);
  });
});

test('TC-LAUNCH-012 载入中点退出', async ({ page, net }) => {
  clearTables(...LAUNCH_TABLES);
  const p = await net({ mode: 'hang' });

  await test.step('1 打开一克之差详情，点「开始游戏」：出现载入页', async () => {
    await startGame(page, 'yike', p.url);
    await expect(loading(page)).toBeVisible();
  });

  await test.step('2 3 秒后点载入页的「退出」：回到一克之差详情页', async () => {
    await sleep(3000);
    await exitButton(page).click();
    await expectDetail(page, 'yike');
  });

  await test.step('3 start 一条、cancel 一条，cancel 带耗时', async () => {
    await expect.poll(() => phases(p, 'yike')).toEqual(['start', 'cancel']);
    expect(evOf(p, 'yike')[1].ms).toBeGreaterThan(0);
  });

  await test.step('4 2 秒后 launch_days：今天 yike 开始 1、取消 1、就绪 0', async () => {
    await expect.poll(() => launchDay('yike')?.cancel ?? 0, { timeout: 5000 }).toBe(1);
    expect(launchDay('yike')).toMatchObject({ starts: 1, cancel: 1, ready: 0 });
  });
});

test('TC-LAUNCH-013 失败页的重试与退出', async ({ page, net }) => {
  const p = await net({ mode: 'hang' });
  let t0 = 0;

  await test.step('1 打开一克之差详情，点「开始游戏」：35 秒内失败页', async () => {
    t0 = await startGame(page, 'yike', p.url);
    await expect(failPage(page)).toBeVisible({ timeout: left(t0, 35_000) });
  });

  await test.step('2 中转改成照常转发，点「重试」：载入页重新出现，10 秒内游戏画面出现', async () => {
    p.mode = 'pass';
    await retryButton(page).click();
    await expect(failPage(page)).toBeHidden();
    await waitPlayable(page, 'yike', 10_000);
  });

  await test.step('3 启动上报依次为 start、fail、start、ready', async () => {
    await expect.poll(() => phases(p, 'yike')).toEqual(['start', 'fail', 'start', 'ready']);
  });

  await test.step('4 退出游戏，中转改回「不回」，打开后宫生死簿，等失败页后点「退出」：回到后宫生死簿详情页', async () => {
    await exitGame(page, 'yike');
    p.mode = 'hang';
    const t1 = await startGame(page, 'hougong', p.url);
    await expect(failPage(page)).toBeVisible({ timeout: left(t1, 35_000) });
    await exitButton(page).click();
    await expectDetail(page, 'hougong');
  });
});

test('TC-LAUNCH-014 带摘要的地址找不到时改用固定地址', async ({ page, net }) => {
  const p = await net({ mode: 'hashed-404' });

  await test.step('1 打开一克之差详情，点「开始游戏」：10 秒内游戏画面出现', async () => {
    await startGame(page, 'yike', p.url);
    await waitPlayable(page, 'yike', 10_000);
  });

  await test.step('2 先请求 /g/yike-<8 位摘要>，被回 404 后请求 /games/yike，没有请求 /games/yike.html', async () => {
    const paths = hitsOf(p, 'yike').map(h => h.path);
    expect(paths[0]).toMatch(/^\/g\/yike-[0-9a-f]{8}$/);
    expect(paths.slice(1)).toEqual(['/games/yike']);
  });

  await test.step('3 一条 ready，没有 fail', async () => {
    await expect.poll(() => phases(p, 'yike')).toContain('ready');
    expect(phases(p, 'yike')).not.toContain('fail');
  });
});

test('TC-LAUNCH-015 游戏文件取不到', async ({ page, net }) => {
  const p = await net({ mode: '404' });

  await test.step('1 打开一克之差详情，点「开始游戏」：10 秒内失败页「游戏文件暂时取不到，稍后再试」', async () => {
    await startGame(page, 'yike', p.url);
    await expectFailPage(page, 'http-404', 10_000);
  });

  await test.step('2 一条 fail，原因 http-404', () => lastFail(p, 'yike', 'http-404'));

  await test.step('3 点「退出」，中转改成「500」，再开一克之差：20 秒内失败页，新的 fail 原因为 http-error', async () => {
    await exitButton(page).click();
    await expectDetail(page, 'yike');
    p.mode = '500';
    await clickStart(page);
    await expectFailPage(page, 'http-error', 20_000);
    await lastFail(p, 'yike', 'http-error');
  });
});

test('TC-LAUNCH-016 离线且缓存里没有', async ({ page, context }) => {
  await openDetail(page, 'yike');

  await test.step('1 浏览器切到离线，点「开始游戏」：3 秒内失败页「网络断开了，连上网再试」', async () => {
    await context.setOffline(true);
    await clickStart(page);
    await expectFailPage(page, 'offline', 3000);
  });

  await test.step('2 恢复联网，点「重试」：10 秒内游戏画面出现', async () => {
    await context.setOffline(false);
    await retryButton(page).click();
    await waitPlayable(page, 'yike', 10_000);
  });
});

test('TC-LAUNCH-018 整个下载超过两分钟', async ({ page, net }) => {
  test.setTimeout(240_000);
  const p = await net({ bytesPerSec: 5 * 1024 });
  await openDetail(page, 'spud-dawn', p.url);
  await p.idle();
  let t0 = 0;

  await test.step('1 点「开始游戏」：进度条持续往前走', async () => {
    t0 = await clickStart(page);
    await sleep(5000);
    const a = await progress(page);
    await sleep(10_000);
    expect(await progress(page)).toBeGreaterThan(a);
  });

  await test.step('2 到点击后第 125 秒：失败页「网络太慢，游戏两分钟还没下载完」，整个过程没出现重试提示', async () => {
    let sawRetry = 0;
    while (!await failPage(page).isVisible() && Date.now() - t0 < 125_000) {
      if (await retrying(page).isVisible()) sawRetry = Date.now() - t0;
      await page.waitForTimeout(500);
    }
    await expectFailPage(page, 'net-slow', 1000);
    expect(sawRetry, '出现过「网络不太稳，正在重试…」').toBe(0);
  });

  await test.step('3 一条 fail，原因 net-slow', () => lastFail(p, 'spud-dawn', 'net-slow'));
});
