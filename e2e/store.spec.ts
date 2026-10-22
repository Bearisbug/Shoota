// 商店、搜索、详情、游戏库、存档码、旧地址与亮暗色（docs/TEST.md §4「商店与页面」），默认电脑视口。
import type { Page } from '@playwright/test';
import { CATALOG } from '../src/catalog';
import { expect, onlyOn, sleep, test } from './lib/fixtures';
import { GAME_FILE } from './lib/proxy';
import { YIKE_LEVEL5, patchMeta, readSave, statOf, writeSave } from './lib/storage';
import {
  cardIds, copy, exitGame, loadAt, frameText, gameFrame, nav, navCurrent, openDetail, pageBackground, pattern, play, progressBar,
  section, startControl, title, toast, waitPlayable,
} from './lib/ui';
import type { Vp } from './lib/viewports';

const ALL = CATALOG.map(g => g.id);
const H = 3600_000, D = 24 * H;
const heading = (page: Page, id: string) => page.getByRole('heading', { level: 1, name: title(id) });
const allSection = (page: Page) => section(page, pattern(copy.store.searching)).or(section(page, copy.store.all)).first();
const searchBox = (page: Page) => page.getByRole('searchbox', { name: copy.search.label }).locator('visible=true').first();
const pasteBox = (page: Page) => page.getByPlaceholder(copy.backup.placeholder);
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first();
const genre = (page: Page, g: string) => page.getByRole('group', { name: copy.store.genreFilter }).getByRole('button', { name: new RegExp(`^${g}\\s*\\d*$`) });
const showsLevel = (fr: Awaited<ReturnType<typeof play>>, n: number) => expect.poll(() => frameText(fr)).toContain(`第 ${n} 关`);

onlyOn('desktop');

test('TC-STORE-001 商店首页、导航与 13 款目录', async ({ page }) => {
  await test.step('1 打开首页：标题「shoota 游戏平台」；导航商店、游戏库、存档，商店高亮', async () => {
    await page.goto('/');
    await expect(page).toHaveTitle(copy.pageTitle);
    for (const n of [copy.nav.store, copy.nav.library, copy.nav.backup]) await expect(nav(page).getByRole('link', { name: n })).toBeVisible();
    await expect(navCurrent(page)).toHaveText(copy.nav.store);
  });

  await test.step('2 「全部游戏」标为 13 款，顺序同目录', async () => {
    const s = section(page, copy.store.all);
    await expect(s.getByText(copy.store.count(13), { exact: true })).toBeVisible();
    expect(await cardIds(s)).toEqual(ALL);
  });

  await test.step('3 精选区标题「精选与推荐」，第一款是薯光；页面上没有「继续游玩」', async () => {
    const s = section(page, copy.store.featured);
    expect((await cardIds(s))[0]).toBe('spud-dawn');
    await expect(page.getByText(copy.store.continue, { exact: true })).toHaveCount(0);
  });

  await test.step('4 点一克之差的卡片：地址 #game-yike，大标题「一克之差」，有「开始游戏」', async () => {
    await section(page, copy.store.all).locator('a[href="#game-yike"]').first().click();
    await expect(page).toHaveURL(/#game-yike$/);
    await expect(heading(page, 'yike')).toBeVisible();
    await expect(startControl(page)).toHaveText(copy.game.start);
  });

  await test.step('5 回到商店：底部说明带「进度只存在这台设备上」与「备份 / 恢复进度」', async () => {
    await nav(page).getByRole('link', { name: copy.nav.store }).click();
    await expect(page.getByRole('heading', { name: copy.store.bandTitle })).toBeVisible();
    await expect(btn(page, copy.store.bandAction)).toBeVisible();
  });
});

// 第 4 步靠 page.route 推迟游戏文件；Service Worker 接管页面后游戏文件改由它去取，page.route 拦不到
test.describe('TC-STORE-002', () => {
  test.use({ serviceWorkers: 'block' });

  test('TC-STORE-002 商店三块与继续游玩', async ({ page }) => {
    await page.goto('/');
    await patchMeta(page, m => {
      for (const [id, days] of [['douluo', 4], ['yike', 3], ['f1-driver', 2], ['basketball-star', 1]] as const) {
        Object.assign(statOf(m, id), { seconds: 600, last: Date.now() - days * D });
      }
    });
    await page.reload();

    await test.step('1 从上到下依次是「精选与推荐」「继续游玩」「全部游戏」', async () => {
      const ys = [];
      for (const h of [copy.store.featured, copy.store.continue, copy.store.all]) ys.push((await page.getByRole('heading', { name: h, exact: true }).boundingBox())!.y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    });

    await test.step('2 「继续游玩」只有 3 张，依次为篮球巨星、F1-Driver、一克之差', async () => {
      expect(await cardIds(section(page, copy.store.continue))).toEqual(['basketball-star', 'f1-driver', 'yike']);
    });

    await test.step('3 「全部游戏」13 款，顺序不变', async () => {
      expect(await cardIds(section(page, copy.store.all))).toEqual(ALL);
    });

    await test.step('4 点「继续游玩」里的篮球巨星：地址 #play-basketball-star，出现载入页', async () => {
      // 本地取游戏文件太快，推迟 1.5 秒让载入页看得清
      await page.route(u => GAME_FILE.test(u.pathname), async r => { await sleep(1500); await r.continue(); });
      await section(page, copy.store.continue).locator('a[href="#play-basketball-star"]').first().click();
      await expect(page).toHaveURL(/#play-basketball-star$/);
      await expect(progressBar(page)).toBeVisible();
      await expect(page.getByText(title('basketball-star'), { exact: true }).locator('visible=true').first()).toBeVisible();
    });
  });
});

test('TC-STORE-003 按类型筛选', async ({ page }) => {
  await page.goto('/');
  const s = allSection(page);

  await test.step('1 点「体育经理」：只剩 NBA-经理、CBA-经理，标为 2 款', async () => {
    await genre(page, '体育经理').click();
    await expect(s.getByText(copy.store.count(2), { exact: true })).toBeVisible();
    expect(await cardIds(s)).toEqual(['nba', 'cba']);
  });

  await test.step('2 点「赛车经理」：只剩 F1-Team Principal，标为 1 款', async () => {
    await genre(page, '赛车经理').click();
    await expect(s.getByText(copy.store.count(1), { exact: true })).toBeVisible();
    expect(await cardIds(s)).toEqual(['f1']);
  });

  await test.step('3 点「全部」：恢复 13 款', async () => {
    await genre(page, copy.store.allGenres).click();
    await expect(s.getByText(copy.store.count(13), { exact: true })).toBeVisible();
    expect(await cardIds(s)).toEqual(ALL);
  });
});

test('TC-STORE-004 按名称、类型、标签与简介搜索', async ({ page }) => {
  await page.goto('/#library');
  const only = async (q: string, ids: string[]) => {
    await searchBox(page).fill(q);
    await expect(page.getByRole('heading', { name: copy.store.searching(q) })).toBeVisible();
    expect(await cardIds(allSection(page))).toEqual(ids);
  };

  await test.step('1 输入「首富」：跳回商店，标题「搜索「首富」」，只有我要当首富；精选与继续游玩隐藏', async () => {
    await only('首富', ['wealth-reborn']);
    await expect(page).toHaveURL(/#store$|\/$/);
    await expect(page.getByRole('heading', { name: copy.store.featured })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: copy.store.continue })).toHaveCount(0);
  });

  await test.step('2 「赛车经理」（类型）：只有 F1-Team Principal', () => only('赛车经理', ['f1']));
  await test.step('3 「肉鸽」（标签）：只有薯光', () => only('肉鸽', ['spud-dawn']));
  await test.step('4 「戥秤」（简介）：只有一克之差', () => only('戥秤', ['yike']));

  await test.step('5 「没有这款游戏」：显示「没有找到匹配的游戏。」与「清除筛选」', async () => {
    await searchBox(page).fill('没有这款游戏');
    await expect(page.getByText(copy.store.empty, { exact: true })).toBeVisible();
    await expect(btn(page, copy.store.clear)).toBeVisible();
  });

  await test.step('6 点「清除筛选」：搜索框清空，恢复精选与 13 款', async () => {
    await btn(page, copy.store.clear).click();
    await expect(searchBox(page)).toHaveValue('');
    await expect(page.getByRole('heading', { name: copy.store.featured })).toBeVisible();
    expect(await cardIds(section(page, copy.store.all))).toEqual(ALL);
  });
});

test('TC-STORE-005 详情页记录、成就与愿望单', async ({ page }) => {
  await page.goto('/');
  const defs = [1, 2, 3, 4, 5].map(i => ({ key: `a${i}`, name: `成就${'一二三四五'[i - 1]}` }));
  await patchMeta(page, m => {
    Object.assign(statOf(m, 'basketball-star'), { seconds: 1800, last: Date.now() - 3 * H, ach: { a1: Date.now() - 4 * H, a2: Date.now() - 4 * H } });
    m.achDefs['basketball-star'] = defs;
  });
  await loadAt(page, '/#game-basketball-star');
  await expect(heading(page, 'basketball-star')).toBeVisible();

  await test.step('1 开始卡：「开始玩《篮球巨星》」「你已玩 30 分钟，上次 3 小时前。存档会接着上次。」，按钮「继续游戏」', async () => {
    await expect(page.getByText(copy.game.startTitle(title('basketball-star')), { exact: true })).toBeVisible();
    await expect(page.getByText(copy.game.startPlayed('30 分钟', '3 小时前'), { exact: true })).toBeVisible();
    await expect(startControl(page)).toHaveText(copy.game.resume);
  });

  await test.step('2 你的记录：30 分钟、3 小时前；成就「已解锁 2 / 5」，成就一、成就二已解锁', async () => {
    const rec = section(page, copy.game.record);
    await expect(rec.getByText('30 分钟', { exact: true })).toBeVisible();
    await expect(rec.getByText('3 小时前', { exact: true })).toBeVisible();
    const ach = section(page, copy.game.achievements);
    await expect(ach).toContainText(/已解锁\s*2\s*\/\s*5/);
    // 已解锁的那几条读出来带「已解锁」
    for (const d of defs) {
      const item = ach.getByRole('listitem').filter({ hasText: d.name });
      if (d.key === 'a1' || d.key === 'a2') await expect(item).toContainText(copy.game.unlocked);
      else await expect(item).not.toContainText(copy.game.unlocked);
    }
  });

  await test.step('3 点「加入愿望单」：提示「已加入愿望单」，按钮变成「已在愿望单」', async () => {
    await btn(page, copy.game.wishAdd).click();
    await expect(toast(page, copy.game.wishAdded)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.game.wishIn })).toBeVisible();
  });

  await test.step('4 再点一次：提示「已移出愿望单」，按钮变回「加入愿望单」', async () => {
    await page.getByRole('button', { name: copy.game.wishIn }).click();
    await expect(toast(page, copy.game.wishRemoved)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.game.wishAdd })).toBeVisible();
  });
});

test('TC-STORE-006 没玩过的详情页与找不到的游戏', async ({ page }) => {
  await test.step('1 #game-f1-driver：「点开就能玩，存档自动保存。」与「开始游戏」；四项事实，大小「603 KB」', async () => {
    await openDetail(page, 'f1-driver');
    await expect(page.getByText(copy.game.startNew, { exact: true })).toBeVisible();
    await expect(startControl(page)).toHaveText(copy.game.start);
    const main = page.getByRole('main');
    for (const f of Object.values(copy.game.facts)) await expect(main.getByText(f, { exact: true }).first()).toBeVisible();
    await expect(main.getByText('603 KB', { exact: true })).toBeVisible();
  });

  await test.step('2 你的记录：「还没玩过」与「—」', async () => {
    const rec = section(page, copy.game.record);
    await expect(rec.getByText(copy.library.neverPlayed, { exact: true })).toBeVisible();
    await expect(rec.getByText('—', { exact: true })).toBeVisible();
  });

  await test.step('3 #game-not-a-game：「找不到这款游戏…」与「回到商店」', async () => {
    await page.goto('/#game-not-a-game');
    await expect(page.getByText(copy.game.notFound, { exact: true })).toBeVisible();
    await expect(btn(page, copy.game.backToStore)).toBeVisible();
  });

  await test.step('4 点「回到商店」：显示商店，导航高亮商店', async () => {
    await btn(page, copy.game.backToStore).click();
    await expect(page.getByRole('heading', { name: copy.store.all })).toBeVisible();
    await expect(navCurrent(page)).toHaveText(copy.nav.store);
  });
});

test('TC-STORE-007 游戏库排序、愿望单与空态', async ({ page }) => {
  await test.step('1 #library：「游戏库还是空的」与「去商店挑一款」', async () => {
    await page.goto('/#library');
    await expect(page.getByText(copy.library.emptyTitle, { exact: true })).toBeVisible();
    await expect(btn(page, copy.library.emptyAction)).toBeVisible();
  });

  await test.step('2 斗罗、一克之差各玩 6 秒后退出，F1-Driver 加入愿望单：按钮变成「已在愿望单」', async () => {
    for (const id of ['douluo', 'yike']) {
      await play(page, id);
      await sleep(6000);
      await exitGame(page, id);
    }
    await openDetail(page, 'f1-driver');
    await btn(page, copy.game.wishAdd).click();
    await expect(page.getByRole('button', { name: copy.game.wishIn })).toBeVisible();
  });

  const list = page.getByRole('list', { name: copy.library.listLabel });

  await test.step('3 #library：「我的游戏库」，依次一克之差、斗罗·万相、F1-Driver；F1-Driver 显示「愿望单」与「还没玩过」', async () => {
    await page.goto('/#library');
    await expect(page.getByRole('heading', { name: copy.library.title })).toBeVisible();
    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    for (const [i, id] of ['yike', 'douluo', 'f1-driver'].entries()) await expect(rows.nth(i)).toContainText(title(id));
    await expect(rows.nth(2)).toContainText(copy.library.wished);
    await expect(rows.nth(2)).toContainText(copy.library.neverPlayed);
  });

  await test.step('4 点斗罗·万相：右侧详情有游玩时间、上次游玩与「继续游戏」', async () => {
    await list.getByRole('listitem').nth(1).click();
    const main = page.getByRole('main');
    await expect(main.getByText(copy.library.playTime, { exact: true }).locator('visible=true').first()).toBeVisible();
    await expect(main.getByText(copy.library.lastPlayed, { exact: true }).locator('visible=true').first()).toBeVisible();
    await expect(btn(page, copy.library.resume)).toBeVisible();
  });
});

test.describe('存档码', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('TC-STORE-008 存档码两步恢复', async ({ page: a, fresh }) => {
    await a.goto('/');
    await writeSave(a, 'yike', YIKE_LEVEL5);
    await patchMeta(a, m => { Object.assign(statOf(m, 'yike'), { seconds: 600, last: Date.now() - H }); });
    const b = await fresh({ permissions: ['clipboard-read', 'clipboard-write'] });
    await play(b, 'yike');
    await exitGame(b, 'yike');
    const before = await readSave(b, 'yike');
    expect(before).toBeTruthy();
    let code = '';

    await test.step('1 A 在存档页点「复制存档码」：提示已复制，剪贴板里以 CJ 开头', async () => {
      await loadAt(a, '/#backup');
      await btn(a, copy.backup.copy).click();
      await expect(toast(a, copy.backup.copied)).toBeVisible();
      code = await a.evaluate(() => navigator.clipboard.readText());
      expect(code).toMatch(/^CJ/);
    });

    await test.step('2 B 粘贴后点「恢复进度」：导出时间与覆盖提示，「确认恢复」与「取消」；B 本机存档未变', async () => {
      await b.goto('/#backup');
      await pasteBox(b).fill(code);
      await btn(b, copy.backup.restore).click();
      const t = copy.backup.titles([title('yike')]);
      await expect(b.getByText(pattern(w => copy.backup.askExport(w, t)))).toBeVisible();
      // 导出时间与覆盖提示在同一段里，按段内文字找
      await expect(b.getByText(copy.backup.askOverwrite(t))).toBeVisible();
      await expect(btn(b, copy.backup.confirm)).toBeVisible();
      await expect(btn(b, copy.backup.cancel)).toBeVisible();
      expect(await readSave(b, 'yike')).toEqual(before);
    });

    await test.step('3 点「确认恢复」：提示「已恢复 1 款游戏的进度」，跳到游戏库；B 存档与 A 相同', async () => {
      await btn(b, copy.backup.confirm).click();
      await expect(toast(b, copy.backup.restored(1))).toBeVisible();
      await expect(b).toHaveURL(/#library$/);
      expect(await readSave(b, 'yike')).toEqual(YIKE_LEVEL5);
    });

    await test.step('4 B 打开一克之差：第 5 关', async () => {
      await showsLevel(await play(b, 'yike'), 5);
    });
  });

  test('TC-STORE-009 存档码错误提示与存档文件', async ({ page, fresh }) => {
    const other = await fresh();
    await play(other, 'yike');
    await exitGame(other, 'yike');
    await other.goto('/#backup');
    const [dl] = await Promise.all([other.waitForEvent('download'), btn(other, copy.backup.download).click()]);
    expect(dl.suggestedFilename()).toMatch(/^shoota-存档-.+\.txt$/);
    const file = test.info().outputPath(dl.suggestedFilename());
    await dl.saveAs(file);
    await page.goto('/#backup');

    await test.step('1 不粘贴，点「恢复进度」：先粘贴存档码…', async () => {
      await btn(page, copy.backup.restore).click();
      await expect(page.getByText(copy.backup.errEmpty, { exact: true })).toBeVisible();
    });

    await test.step('2 粘贴 CJ1abc：这段存档码读不出来…', async () => {
      await pasteBox(page).fill('CJ1abc');
      await btn(page, copy.backup.restore).click();
      await expect(page.getByText(copy.backup.errBad, { exact: true })).toBeVisible();
    });

    await test.step('3 粘贴只含目录外游戏的 CJ0：这份存档码里没有本平台游戏的进度。', async () => {
      await pasteBox(page).fill('CJ0eyJ2IjoxLCJhdCI6MCwic2F2ZXMiOnsibm90LWEtZ2FtZSI6e319fQ==');
      await btn(page, copy.backup.restore).click();
      await expect(page.getByText(copy.backup.errNone, { exact: true })).toBeVisible();
    });

    await test.step('4 选择下载的存档文件：显示导出时间与《一克之差》，确认后提示已恢复 1 款', async () => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), btn(page, copy.backup.pickFile).click()]);
      await chooser.setFiles(file);
      const t = copy.backup.titles([title('yike')]);
      await expect(page.getByText(pattern(w => copy.backup.askExport(w, t)))).toBeVisible();
      await btn(page, copy.backup.confirm).click();
      await expect(toast(page, copy.backup.restored(1))).toBeVisible();
    });
  });
});

test('TC-STORE-010 旧分享链接与地址兼容', async ({ page }) => {
  await test.step('1 /#game-f1：F1-Team Principal 详情页', async () => {
    await page.goto('/#game-f1');
    await expect(heading(page, 'f1')).toBeVisible();
  });

  await test.step('2 /#login：地址换成 #store，显示商店；后退不回 #login', async () => {
    await page.goto('/');
    await page.goto('/#login');
    await expect(page).toHaveURL(/#store$/);
    await expect(page.getByRole('heading', { name: copy.store.all })).toBeVisible();
    await page.goBack();
    expect(new URL(page.url()).hash).not.toBe('#login');
  });

  await test.step('3 /#play-not-a-game：显示商店，没有载入页', async () => {
    await page.goto('/#play-not-a-game');
    await expect(page.getByRole('heading', { name: copy.store.all })).toBeVisible();
    await expect(progressBar(page)).toHaveCount(0);
  });

  await test.step('4 /#whatever：显示商店，导航高亮商店', async () => {
    await page.goto('/#whatever');
    await expect(page.getByRole('heading', { name: copy.store.all })).toBeVisible();
    await expect(navCurrent(page)).toHaveText(copy.nav.store);
  });

  await test.step('5 开始一克之差，画面出现后后退：回到详情页，滚在顶部', async () => {
    await openDetail(page, 'yike');
    await page.evaluate(() => window.scrollTo(0, 400));
    await startControl(page).click();
    await waitPlayable(page, 'yike');
    await page.goBack();
    await expect(heading(page, 'yike')).toBeVisible();
    await expect(gameFrame(page, 'yike')).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
});

// 可见的按钮、链接与输入框里点击区域小于 44×44 的，以及小于 12 像素的文字；句子里的行内链接不算
function smallThings() {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && +cs.opacity > 0 && !el.closest('[aria-hidden="true"]');
  };
  const inlineLink = (el: Element) => el.tagName === 'A' && getComputedStyle(el).display === 'inline'
    && (el.parentElement?.textContent ?? '').trim().length > (el.textContent ?? '').trim().length;
  const label = (el: Element) => (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 30);
  const targets = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')]
    .filter(el => shown(el) && !inlineLink(el))
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width < 44 || r.height < 44)
    .map(({ el, r }) => `${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  const texts: string[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent?.trim() || !shown(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) texts.push(`${n.textContent.trim().slice(0, 20)} ${fs}px`);
  }
  return { targets, texts };
}

test('TC-STORE-011 跟随系统亮暗、点击区域与导航形态', async ({ page, fresh }) => {
  const themeColor = () => page.evaluate(() => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    .find(m => !m.media || matchMedia(m.media).matches)?.content);

  await test.step('1 浅色：页面背景 #F7F5F0', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect(await pageBackground(page)).toBe('rgb(247, 245, 240)');
  });

  await test.step('2 切到深色不刷新：背景 #13100D，theme-color 为深色值', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => pageBackground(page)).toBe('rgb(19, 16, 13)');
    expect(await themeColor()).toBe('#13100D');
  });

  const VPS: Vp[] = ['portrait', 'landscape', 'tablet', 'desktop'];
  const PAGES = ['#store', '#game-yike', '#library', '#backup'];

  await test.step('3 四个视口 × 四页：点击区域都不小于 44×44，文字不小于 12 像素', async () => {
    for (const at of VPS) {
      const pg = await fresh({ at });
      for (const h of PAGES) {
        await pg.goto('/' + h);
        await pg.waitForLoadState('networkidle');
        const s = await pg.evaluate(smallThings);
        expect.soft(s.targets, `${at} ${h} 点击区域`).toEqual([]);
        expect.soft(s.texts, `${at} ${h} 文字`).toEqual([]);
      }
      await pg.context().close();
    }
  });

  await test.step('4 导航形态：竖屏底部标签栏，横屏与平板左侧窄栏，电脑侧栏加吸顶顶栏；都没有横向滚动', async () => {
    for (const at of VPS) {
      const pg = await fresh({ at });
      await pg.goto('/');
      const vw = pg.viewportSize()!.width, vh = pg.viewportSize()!.height;
      // 窄栏与侧栏量导航外面的整条栏，不量栏里那组链接；标签栏本身就是整条栏
      const b = (await (at === 'portrait' ? nav(pg) : nav(pg).locator('xpath=..')).boundingBox())!;
      if (at === 'portrait') {
        expect.soft(Math.round(b.y + b.height), `${at} 标签栏贴底`).toBe(vh);
        expect.soft(Math.round(b.width), `${at} 标签栏通宽`).toBe(vw);
      } else if (at === 'desktop') {
        expect.soft(Math.round(b.x), `${at} 侧栏贴左`).toBe(0);
        expect.soft(b.width, `${at} 侧栏宽`).toBeGreaterThanOrEqual(160);
        const top = async () => (await searchBox(pg).boundingBox())!.y;
        expect.soft(await top(), `${at} 搜索框在顶栏`).toBeLessThan(100);
        await pg.evaluate(() => window.scrollTo(0, 800));
        expect.soft(await top(), `${at} 顶栏吸顶`).toBeLessThan(100);
      } else {
        expect.soft(Math.round(b.x), `${at} 窄栏贴左`).toBe(0);
        expect.soft(b.width, `${at} 窄栏宽`).toBeLessThanOrEqual(120);
        expect.soft(b.height, `${at} 窄栏高`).toBeGreaterThanOrEqual(vh * 0.8);
      }
      expect.soft(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${at} 没有横向滚动`).toBe(true);
      await pg.context().close();
    }
  });
});
