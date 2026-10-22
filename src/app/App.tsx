// 平台应用：hash 路由、应用壳、页面间共享的界面状态、恢复码弹层与云存档提示。
// 路由行为沿用旧版 route()（dd731d6 public/index.html），见 docs/DESIGN.md §13 路由与兼容。
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CATALOG, gameById } from '../catalog';
import { AppShell, Icon, ToastProvider, type NavGroup } from '../ui';
import wordmarkCream from '../../brand/assets/logo/wordmark-cream.svg';
import wordmarkInk from '../../brand/assets/logo/wordmark-ink.svg';
import appIcon from '../../brand/assets/logo/app-icon.svg';
import { ALL_GENRES, filterForTag, type StoreFilter } from './browse';
import { SearchField } from './components/bits';
import { copy } from './copy';
import { isStandalone } from './env';
import * as icons from './icons';
import { useMedia, WIDE } from './media';
import { BackupPage } from './pages/BackupPage';
import { GamePage } from './pages/GamePage';
import { LibraryPage } from './pages/LibraryPage';
import { RecoverSheet } from './pages/RecoverSheet';
import { StorePage } from './pages/StorePage';
import { go, navOf, parseHash, replaceHash, type Route } from './route';
import { ServicesProvider, useServices, type AppDeps } from './services';
import { AppUiProvider, type AppUi } from './state';
import { useAppToast } from './toast';
import './App.css';

const NAV: readonly NavGroup[] = [{
  id: 'main',
  items: [
    { id: 'store', label: copy.nav.store, href: '#store', icon: <Icon src={icons.store} /> },
    { id: 'library', label: copy.nav.library, href: '#library', icon: <Icon src={icons.library} /> },
    { id: 'backup', label: copy.nav.backup, href: '#backup', icon: <Icon src={icons.save} /> },
  ],
}];

const subscribeHash = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
const useHash = () => useSyncExternalStore(subscribeHash, () => location.hash, () => '');

// 不在商店（含不认识的地址显示的商店）时先跳回 #store，旧版判断 (hash || 'store') !== 'store'
const toStore = () => {
  if ((location.hash.slice(1) || 'store') !== 'store') go('store');
};

export function App({ services, Player }: AppDeps) {
  return (
    <ServicesProvider value={services}>
      <div className="app-root">
        <ToastProvider>
          <Shell Player={Player} />
        </ToastProvider>
      </div>
    </ServicesProvider>
  );
}

function Shell({ Player }: Pick<AppDeps, 'Player'>) {
  const services = useServices();
  const toast = useAppToast();
  const hash = useHash();
  const route: Route = useMemo(() => parseHash(hash), [hash]);
  const wide = useMedia(WIDE);

  const [filter, setFilter] = useState<StoreFilter>({ q: '', genre: ALL_GENRES });
  const [hero, setHero] = useState(0);
  const [libSel, setLibSel] = useState<string | null>(null);
  const [recover, setRecover] = useState<{ open: boolean; code: string; n: number }>({ open: false, code: '', n: 0 });

  const openRecover = useCallback((code = '') => setRecover(r => ({ open: true, code, n: r.n + 1 })), []);

  const ui: AppUi = useMemo(() => ({
    route,
    filter,
    search(q) {
      setFilter({ q, genre: ALL_GENRES });
      toStore();
    },
    applyTag(tag) {
      setFilter(filterForTag(CATALOG, tag));
      toStore();
    },
    clearFilter: () => setFilter({ q: '', genre: ALL_GENRES }),
    hero,
    setHero,
    libSel,
    setLibSel,
    openRecover,
  }), [route, filter, hero, libSel, openRecover]);

  // 主屏幕应用第一次打开、本机还没有进度：直接弹出输入恢复码（FLOW-RECOVER S1，ADR-008）。
  // 要排在下面 #recover= 那段之前：同一次提交里后调用的 openRecover 生效，链接带来的恢复码不能被这里的空码盖掉
  useEffect(() => {
    const { stats, cloud } = services.getSnapshot();
    if (isStandalone() && !cloud && !Object.values(stats).some(s => s.last || s.seconds)) openRecover();
  }, [services, openRecover]);

  // 旧链接与特殊地址：#login 换成 #store；目录里没有的游戏回商店；#recover= 只弹确认，地址换成存档页
  useEffect(() => {
    if (hash === '#login') replaceHash('store');
    else if (route.page === 'play' && !gameById(route.id)) replaceHash('store');
    else if (route.page === 'backup' && route.recover !== undefined) {
      openRecover(route.recover);
      replaceHash('backup');
    }
  }, [hash, route, openRecover]);

  // 每次换页滚到顶部（游戏页是盖在上面的层，不动页面滚动）。
  // 浏览器后退时默认会把滚动位置恢复到离开时的样子，盖过这里的滚到顶部，所以改成手动
  const playing = route.page === 'play';
  useEffect(() => { history.scrollRestoration = 'manual'; }, []);
  useEffect(() => {
    if (!playing) window.scrollTo(0, 0);
  }, [hash, playing]);

  // 开始游戏的链接都指向 #play-<游戏>：在同一次点击里交给运行层，安卓手机才能开局全屏（ADR-008）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href^="#play-"]') : null;
      const game = a && gameById(a.getAttribute('href')!.slice(6));
      if (game) services.beforeLaunch(game);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [services]);

  // 同步把本机存档换成了另一台设备玩得更久的那份（FLOW-CLOUD-CONFLICT S3）
  useEffect(() => services.onCloudReplaced(gids => {
    const titles = gids.flatMap(id => gameById(id)?.title ?? []);
    if (titles.length) toast.say(copy.cloud.replaced(copy.backup.titles(titles)), { label: copy.cloud.replacedAction, onClick: () => go('library') });
  }), [services, toast]);

  if (route.page === 'play') {
    const game = gameById(route.id);
    return game ? <Player key={game.id} game={game} onExit={() => replaceHash('game-' + game.id)} /> : null;
  }

  return (
    <AppUiProvider value={ui}>
      <AppShell
        brand={<BrandLink><picture><source srcSet={wordmarkInk} media="(prefers-color-scheme: light)" /><img className="app-wordmark" src={wordmarkCream} alt={copy.nav.brand} /></picture></BrandLink>}
        brandMark={<BrandLink><img className="app-brandmark" src={appIcon} alt={copy.nav.brand} /></BrandLink>}
        nav={NAV}
        activeId={navOf(route)}
        toolbar={wide ? <SearchField className="app-toolbar-search" /> : undefined}
      >
        {route.page === 'game' ? <GamePage id={route.id} />
          : route.page === 'library' ? <LibraryPage />
          : route.page === 'backup' ? <BackupPage />
          : <StorePage />}
      </AppShell>
      <RecoverSheet key={recover.n} open={recover.open} initialCode={recover.code} onOpenChange={open => setRecover(r => ({ ...r, open }))} />
    </AppUiProvider>
  );
}

function BrandLink({ children }: { children: ReactNode }) {
  return <a className="app-brand-link focus-ring" href="#store" aria-label={copy.nav.home}>{children}</a>;
}
