// 平台页面之间共享的界面状态，沿用旧版 ui 对象（dd731d6）：搜索词、类型筛选、精选第几款、游戏库选中哪款，只存在内存里。
// 恢复码弹层也挂在这里：存档页的入口与 #recover= 链接都从这里打开。

import { createContext, useContext } from 'react';
import type { Route } from './route';
import type { StoreFilter } from './browse';

export interface AppUi {
  route: Route;
  filter: StoreFilter;
  /** 输入搜索词：类型筛选回到「全部」，不在商店时先跳回商店 */
  search(q: string): void;
  /** 标签、类型、面包屑：已知类型按类型筛选，否则当搜索词；不在商店时跳回商店 */
  applyTag(tag: string): void;
  clearFilter(): void;
  hero: number;
  setHero(i: number): void;
  libSel: string | null;
  setLibSel(id: string): void;
  /** 打开恢复码弹层；给了 code 就先填进去，等玩家点查找（恢复链接只弹确认，不自动取回） */
  openRecover(code?: string): void;
}

const AppUiContext = createContext<AppUi | null>(null);
export const AppUiProvider = AppUiContext.Provider;

export function useAppUi(): AppUi {
  const v = useContext(AppUiContext);
  if (!v) throw new Error('useAppUi 需要在 <AppUiProvider> 里使用');
  return v;
}
