// 看板：登录过看板的浏览器不计入（TC-006）、启动面板口径（TC-LAUNCH-017）。看板密码见 docs/TEST.md §3 测试账号表。
import type { Page } from '@playwright/test';
import { LAUNCH_TABLES, STAT_TABLES, clearTables, count, d1 } from './lib/d1';
import { expect, onlyOn, sleep, test } from './lib/fixtures';
import { exitGame, play } from './lib/ui';

onlyOn('desktop');

const PASSWORD = 'local-test-pass';
const LAUNCH = '启动 · 近 7 天';

async function login(page: Page) {
  await page.goto('/kanban');
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '进入看板' }).click();
  await expect(page.getByRole('heading', { level: 2, name: LAUNCH })).toBeVisible();
}

const launchSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: LAUNCH }) });
const stat = (page: Page, label: string) => launchSection(page).locator('.kb-stat').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });
const row = (page: Page, table: string, name: string) => page.getByRole('region', { name: table }).getByRole('row', { name: new RegExp(name) });

test('TC-006 登录过看板的浏览器不计入', async ({ page, context }) => {
  clearTables(...STAT_TABLES, ...LAUNCH_TABLES);

  await test.step('1 打开 /kanban 输入密码登录：进入看板，有 sk_staff cookie', async () => {
    await login(page);
    expect((await context.cookies()).map(c => c.name)).toContain('sk_staff');
  });

  await test.step('2 同一浏览器开局一款游戏玩 30 秒后退出：三张统计表与两张启动表都没有行', async () => {
    await play(page, 'yike');
    await sleep(30_000);
    await exitGame(page, 'yike');
    await sleep(2000);
    for (const t of ['visitors', 'visitor_days', 'game_days', ...LAUNCH_TABLES]) expect(count(t), t).toBe(0);
  });
});

test('TC-LAUNCH-017 看板查看启动成功率', async ({ page }) => {
  clearTables(...STAT_TABLES, ...LAUNCH_TABLES);
  d1(`INSERT INTO launch_days (day, game, country, env, starts, ready, fail) VALUES (date('now','+8 hours','-1 day'), 'yike', 'CN', 'browser', 100, 97, 2);
      INSERT INTO launch_fails (day, country, reason, n) VALUES (date('now','+8 hours','-1 day'), 'CN', 'net-stall', 2);`);
  await login(page);
  const moveTo = async (days: number) => {
    for (const t of LAUNCH_TABLES) d1(`UPDATE ${t} SET day = date('now','+8 hours','-${days} days')`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: LAUNCH })).toBeVisible();
  };

  await test.step('1 「启动 · 近 7 天」：启动次数 100；成功率 97%，下面写「97 次就绪」', async () => {
    await expect(stat(page, '启动次数').locator('dd').first()).toHaveText('100');
    await expect(stat(page, '启动成功率').locator('dd').first()).toHaveText('97%');
    await expect(stat(page, '启动成功率').locator('dd').nth(1)).toHaveText('97 次就绪');
  });

  await test.step('2 启动按国家或地区：中国大陆一行，开始 100、成功率 97%、失败 2、没回音 1', async () => {
    const cells = row(page, '启动按国家或地区', '中国大陆').getByRole('cell');
    await expect(cells.nth(0)).toHaveText('100');
    await expect(cells.nth(1)).toHaveText('97%');
    await expect(cells.nth(2)).toHaveText('2');
    await expect(cells.nth(4)).toHaveText('1');
  });

  await test.step('3 失败原因：「网络中途卡住」2 次，地区写中国大陆 2', async () => {
    const cells = row(page, '失败原因', '网络中途卡住').getByRole('cell');
    await expect(cells.nth(1)).toHaveText('2');
    await expect(cells.nth(2)).toContainText('中国大陆 2');
  });

  await test.step('4 种子日期改成 6 天前：启动次数仍是 100', async () => {
    await moveTo(6);
    await expect(stat(page, '启动次数').locator('dd').first()).toHaveText('100');
  });

  await test.step('5 改成 7 天前：启动面板显示「还没有数据」', async () => {
    await moveTo(7);
    await expect(launchSection(page).getByText('还没有数据', { exact: true })).toBeVisible();
  });
});
