import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { gameById } from '../../catalog';
import { ToastProvider } from '../../ui';
import { App } from '../App';
import { ALL_GENRES } from '../browse';
import { copy } from '../copy';
import { createMockServices, stat, type MockOptions } from '../mock';
import { extra } from '../player/copy';
import type { PlayerView } from '../player/player';
import { LaunchScreen } from '../player-ui/LaunchScreen';
import { PlayerPanel, type PlayerPanelProps } from '../player-ui/PlayerPanel';
import { ServicesProvider, type CloudView } from '../services';
import { AppUiProvider, type AppUi } from '../state';
import { BackupPage } from './BackupPage';
import { GamePage } from './GamePage';
import { LibraryPage } from './LibraryPage';
import { RecoverSheet } from './RecoverSheet';
import { StorePage } from './StorePage';

const HOUR = 3600e3;
const CODE = '01ABCDEFGHJKMNPQ';
const cloudOn = (p: Partial<CloudView> = {}): CloudView => ({ code: CODE, lastSyncAt: 0, tooBig: [], stopped: false, notice: false, ...p });

function render(node: ReactNode, o: MockOptions & { ui?: Partial<AppUi> } = {}) {
  const ui: AppUi = {
    route: { page: 'store' }, filter: { q: '', genre: ALL_GENRES }, search() {}, applyTag() {}, clearFilter() {},
    hero: 0, setHero() {}, libSel: null, setLibSel() {}, openRecover() {}, ...o.ui,
  };
  return renderToStaticMarkup(
    <ServicesProvider value={createMockServices(o)}>
      <ToastProvider><AppUiProvider value={ui}>{node}</AppUiProvider></ToastProvider>
    </ServicesProvider>,
  );
}
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const flat = (h: string) => text(h).replace(/ /g, ''); // 行内链接拆开的句子拼回去比
const headings = (h: string) => [...h.matchAll(/<h([1-3])[^>]*>(.*?)<\/h\1>/g)].map(m => text(m[2]));
// 按出现顺序取文字在页面里的位置，确认先后
const order = (h: string, parts: string[]) => parts.map(p => text(h).indexOf(p));
const ascending = (xs: number[]) => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));
const cardIds = (h: string) => {
  const out: string[] = [];
  for (const m of h.matchAll(/href="#(?:game|play)-([^"]+)"/g)) if (out[out.length - 1] !== m[1]) out.push(m[1]);
  return out;
};

describe('商店 PAGE-STORE（TC-STORE-001～004）', () => {
  it('新浏览器：精选与推荐、全部游戏 13 款、底部说明带，没有继续游玩', () => {
    const h = render(<StorePage />);
    expect(headings(h)).toEqual(expect.arrayContaining([copy.store.featured, copy.store.all, copy.store.bandTitle]));
    expect(ascending(order(h, [copy.store.featured, copy.store.all, copy.store.bandTitle]))).toBe(true);
    expect(text(h)).not.toContain(copy.store.continue);
    expect(text(h)).toContain('13 款');
    expect(cardIds(h)[0]).toBe('spud-dawn');
    expect(text(h)).toContain(copy.store.bandAction);
  });

  it('玩过的游戏：继续游玩在精选与全部游戏之间，只取最近 3 款', () => {
    const now = Date.now();
    const stats = {
      douluo: stat({ seconds: 600, last: now - 96 * HOUR }),
      yike: stat({ seconds: 600, last: now - 72 * HOUR }),
      'f1-driver': stat({ seconds: 600, last: now - 48 * HOUR }),
      'basketball-star': stat({ seconds: 600, last: now - 24 * HOUR }),
    };
    const h = render(<StorePage />, { snapshot: { stats } });
    expect(ascending(order(h, [copy.store.featured, copy.store.continue, copy.store.all]))).toBe(true);
    const cont = h.slice(h.indexOf(copy.store.continue), h.indexOf(copy.store.all));
    expect([...cont.matchAll(/href="#play-([^"]+)"/g)].map(m => m[1])).toEqual(['basketball-star', 'f1-driver', 'yike']);
    expect(text(h.slice(h.indexOf(copy.store.all)))).toContain(copy.store.played('10 分钟'));
  });

  it('搜索：标题换成搜索词，精选与继续游玩隐藏；没结果时给清除筛选', () => {
    const h = render(<StorePage />, { ui: { filter: { q: '首富', genre: ALL_GENRES } } });
    expect(text(h)).toContain(copy.store.searching('首富'));
    expect(text(h)).not.toContain(copy.store.featured);
    expect(cardIds(h)).toEqual(['wealth-reborn']);
    const none = render(<StorePage />, { ui: { filter: { q: '没有这款游戏', genre: ALL_GENRES } } });
    expect(text(none)).toContain(copy.store.empty);
    expect(text(none)).toContain(copy.store.clear);
  });

  it('开通云存档后底部说明带改写，刚开通时顶部提示四段恢复码', () => {
    const h = render(<StorePage />, { snapshot: { cloud: cloudOn({ notice: true }) } });
    expect(text(h)).toContain(copy.store.bandTitleCloud);
    expect(text(h)).toContain(copy.cloud.noticeTitle);
    expect(h).toContain('aria-label="01AB-CDEF-GHJK-MNPQ"');
    expect(text(h)).toContain(copy.cloud.copyCode);
    expect(text(h)).toContain(copy.cloud.noticeDismiss);
  });

  it('标签与类型按钮用 44 高的 md 尺寸', () => {
    const h = render(<StorePage />);
    expect(h).not.toContain('ui-btn-sm');
  });
});

describe('详情 PAGE-GAME（TC-STORE-005、TC-STORE-006）', () => {
  it('没玩过：开始卡、四项概要与你的记录', () => {
    const h = render(<GamePage id="f1-driver" />);
    const t = text(h);
    expect(headings(h)[0]).toBe('F1-Driver');
    expect(t).toContain(copy.game.startNew);
    expect(t).toContain(copy.game.start);
    expect(t).toContain('大小 603 KB');
    expect(t).toContain(`${copy.game.playTime} 还没玩过`);
    expect(t).toContain(`${copy.game.lastPlayed} —`);
    expect(t).toContain(copy.game.wishAdd);
    expect(ascending(order(h, [copy.game.about, copy.game.loop, copy.game.record, copy.game.achievements]))).toBe(true);
  });

  it('玩过：继续游戏、时长与成就进度', () => {
    const now = Date.now();
    const achDefs = { 'basketball-star': [1, 2, 3, 4, 5].map(i => ({ key: 'a' + i, name: '成就' + '一二三四五'[i - 1] })) };
    const stats = { 'basketball-star': stat({ seconds: 1800, last: now - 3 * HOUR, ach: { a1: now, a2: now } }) };
    const h = render(<GamePage id="basketball-star" />, { snapshot: { stats, achDefs, wish: ['basketball-star'] } });
    const t = text(h);
    expect(t).toContain(copy.game.startTitle('篮球巨星'));
    expect(t).toContain(copy.game.startPlayed('30 分钟', '3 小时前'));
    expect(t).toContain(copy.game.resume);
    expect(t).toContain(`${copy.game.unlocked} 2 / 5`);
    expect(t).toContain('★ 成就一');
    expect(t).toContain('☆ 成就三');
    expect(t).toContain(copy.game.wishIn);
  });

  it('找不到的游戏', () => {
    const t = text(render(<GamePage id="not-a-game" />));
    expect(t).toContain(copy.game.notFound);
    expect(t).toContain(copy.game.backToStore);
  });

  it('有身份表、金手指与说明的游戏都列出来', () => {
    const g = gameById('douluo')!;
    const t = text(render(<GamePage id="douluo" />));
    if (g.identities) expect(t).toContain(copy.game.identities);
    if (g.perks) expect(t).toContain(copy.game.perks);
  });
});

describe('游戏库 PAGE-LIBRARY（TC-STORE-007、TC-CLOUD-009、TC-CLOUD-011）', () => {
  it('空态', () => {
    const t = text(render(<LibraryPage />));
    expect(t).toContain(copy.library.emptyTitle);
    expect(t).toContain(copy.library.emptyAction);
  });

  it('按最近倒序；愿望单里没玩过的一行写愿望单；右侧详情是第一款', () => {
    const now = Date.now();
    const stats = { douluo: stat({ seconds: 30, last: now - 2 * HOUR }), yike: stat({ seconds: 30, last: now - HOUR }) };
    const h = render(<LibraryPage />, { snapshot: { stats, wish: ['f1-driver'] } });
    const list = h.slice(h.indexOf('app-lib-list'), h.indexOf('app-lib-main'));
    expect([...list.matchAll(/<b>([^<]+)<\/b>/g)].map(m => m[1])).toEqual(['一克之差', '斗罗·万相', 'F1-Driver']);
    const f1 = text(list.slice(list.indexOf('F1-Driver'), list.lastIndexOf('</li>')));
    expect(f1).toBe(`F1-Driver ${copy.library.wished}`);
    expect(text(h)).toContain(copy.library.count(3, null));
    expect(flat(h)).toContain(copy.library.aboutText('一克之差').join('').replace(/ /g, ''));
  });

  it('被换掉存档的游戏显示可撤销与换回入口；开通云存档后关于存档改写', () => {
    const now = Date.now();
    const at = now - 3 * 24 * HOUR;
    const h = render(<LibraryPage />, {
      snapshot: { stats: { yike: stat({ seconds: 600, last: now }) }, undo: { yike: { at, why: 'conflict' } }, cloud: cloudOn() },
    });
    const t = text(h);
    expect(t).toContain(copy.library.undoBadge);
    expect(t).toContain(copy.library.undoConflict(new Date(at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })));
    expect(t).toContain(copy.library.undoAction);
    expect(flat(h)).toContain(copy.library.aboutTextCloud('一克之差').join('').replace(/ /g, ''));
  });
});

describe('存档 PAGE-BACKUP（TC-CLOUD-002、TC-CLOUD-012、TC-CLOUD-014、TC-CLOUD-022）', () => {
  it('没开通：云存档卡写会自动开通，说明用旧版，备份卡先整理，恢复卡逐字沿用', () => {
    const h = render(<BackupPage />);
    const t = text(h);
    expect(headings(h)[0]).toBe(copy.backup.title);
    expect(t).toContain(copy.backup.intro);
    expect(t).toContain(copy.cloud.notYet);
    expect(t).toContain(copy.cloud.enterCode);
    expect(t).toContain(copy.backup.packing);
    expect(ascending(order(h, [copy.cloud.cardTitle, copy.backup.packTitle, copy.backup.restoreTitle]))).toBe(true);
    expect(t).toContain(copy.backup.restoreText);
    expect(h).toContain(`placeholder="${copy.backup.placeholder}"`);
    expect(t).toContain(copy.backup.restore);
    expect(t).toContain(copy.backup.pickFile);
    expect(h).toMatch(/<input[^>]*type="file"[^>]*hidden/);
    // 本机进度整理完之前恢复按钮转圈，算不出「会被替换」时不能提交
    expect(h).toMatch(/<button[^>]*type="submit"[^>]*aria-busy="true"/);
  });

  it('开通后：四段恢复码、复制、上次同步与输入入口；凭据不对与存档太大各有说明', () => {
    const h = render(<BackupPage />, { snapshot: { cloud: cloudOn({ stopped: true, tooBig: ['hougong'] }) } });
    const t = text(h);
    expect(t).toContain(copy.backup.introCloud);
    expect(t).toContain('01AB CDEF GHJK MNPQ');
    expect(t).toContain(copy.cloud.copyCode);
    expect(t).toContain(`${copy.cloud.lastSync} ${copy.cloud.neverSynced}`);
    expect(t).toContain(copy.cloud.enterCode);
    expect(t).toContain(copy.cloud.stopped);
    expect(t).toContain(`后宫生死簿 ${copy.cloud.tooBig}`);
  });

  it('云存档卡标题下面一行跟着状态：没开通与暂停同步时写存在这台设备，在同步时写同步到云端（TC-CLOUD-022）', () => {
    const sub = (o: MockOptions) => /<p class="ui-card-subtitle">(.*?)<\/p>/.exec(render(<BackupPage />, o))?.[1];
    expect(sub({})).toBe(copy.cloud.localOnly);
    expect(sub({ snapshot: { cloud: cloudOn() } })).toBe(copy.cloud.synced);
    expect(sub({ snapshot: { cloud: cloudOn({ stopped: true }) } })).toBe(copy.cloud.localOnly);
  });
});

describe('恢复确认 PAGE-RECOVER（TC-CLOUD-008）', () => {
  it('恢复链接打开时恢复码已填好，停在输入步', () => {
    const h = render(<RecoverSheet open initialCode={CODE} onOpenChange={() => {}} />);
    expect(text(h)).toContain(copy.recover.title);
    expect(h).toContain(`value="${CODE}"`);
    expect(text(h)).toContain(copy.recover.lookup);
    expect(text(h)).not.toContain(copy.recover.confirm);
  });
});

describe('游戏面板与载入页（TC-PLAY-004、TC-PLAY-013、TC-LAUNCH-*）', () => {
  const g = gameById('yike')!;
  const panel = (p: Partial<PlayerPanelProps> = {}) => render(
    <PlayerPanel
      open onOpenChange={() => {}} placement="sheet" anchor={null} game={g} statusText="第 3 关"
      saveText={copy.player.saveLoaded} cloud={{ text: extra.cloudOff, long: false }} secs={0}
      fullscreen={{ mode: 'auto', on: false }} rotateNote={[extra.preferPortrait]}
      onFullscreen={() => {}} onInstall={() => {}} onWechat={() => {}} onResetFloat={() => {}} onExit={() => {}}
      {...p}
    />,
  );

  it('标题「游戏菜单」，内容从上到下是游戏名、存档、云存档、本次时长、全屏、旋转说明、恢复默认位置、退出', () => {
    const h = panel();
    expect(h).toContain(`aria-label="${copy.player.panelTitle}"`);
    expect(ascending(order(h, ['一克之差', '第 3 关', copy.player.saveLoaded, extra.cloudOff, '本次 0 分钟', copy.player.fullscreen, extra.preferPortrait, copy.player.resetFloat, copy.player.exit]))).toBe(true);
    expect(h).toContain(`aria-label="${extra.close}"`);
    expect(text(panel({ fullscreen: { mode: 'button', on: true } }))).toContain(extra.exitFullscreen);
  });

  it('iPhone 换成添加到主屏幕，微信换成在浏览器打开，都没有全屏', () => {
    const ios = text(panel({ fullscreen: { mode: 'install', on: false } }));
    expect(ios).toContain(copy.player.installGuide);
    expect(ios).not.toMatch(new RegExp(`(^| )${copy.player.fullscreen}( |$)`));
    const wx = text(panel({ fullscreen: { mode: 'wechat', on: false } }));
    expect(wx).toContain(copy.player.wechatGuide);
    expect(wx).not.toMatch(new RegExp(`(^| )${copy.player.fullscreen}( |$)`));
  });

  const view = (p: Partial<PlayerView>): PlayerView => ({
    gid: 'yike', status: 'loading', progress: 0.4, retrying: false, reason: undefined, save: { kind: 'reading' },
    statusText: '', secs: 0, savedAt: 0, prefer: 'portrait', locked: false, fullscreen: false, ...p,
  });

  it('载入页：名称、进度条、退出；自动重试时进度条下方提示', () => {
    const h = render(<LaunchScreen game={g} view={view({ retrying: true })} onRetry={() => {}} onExit={() => {}} />);
    expect(h).toContain('role="progressbar"');
    expect(h).toContain('aria-valuenow="40"');
    expect(text(h)).toContain(copy.launch.loading);
    expect(ascending(order(h, [copy.launch.loading, copy.launch.retrying, copy.launch.exit]))).toBe(true);
  });

  it('失败页：按原因给文案，重试与退出', () => {
    const t = text(render(<LaunchScreen game={g} view={view({ status: 'failed', reason: 'offline' })} onRetry={() => {}} onExit={() => {}} />));
    expect(t).toContain(extra.failTitle);
    expect(t).toContain(copy.launch.fail.offline);
    expect(t).toContain(copy.launch.retry);
    expect(t).toContain(copy.launch.exit);
  });
});

describe('应用壳', () => {
  it('导航三项、品牌链接回商店，默认显示商店', () => {
    const h = renderToStaticMarkup(<App services={createMockServices()} Player={() => null} />);
    expect(h).toContain(`aria-label="${copy.nav.label}"`);
    for (const l of [copy.nav.store, copy.nav.library, copy.nav.backup]) expect(text(h)).toContain(l);
    expect(h).toContain(`aria-label="${copy.nav.home}"`);
    expect(text(h)).toContain(copy.store.featured);
  });
});
