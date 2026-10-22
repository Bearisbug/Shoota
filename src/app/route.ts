// hash 路由，沿用旧版 route()（dd731d6 public/index.html）：页面地址是 # 之后的部分，旧分享链接原样可用（REQ-021）。
// 不认识的地址一律显示商店；#move= 由启动时的搬家导入处理，#login 换成 #store，#recover= 打开存档页的恢复确认。

export type Route =
  | { page: 'store' }
  | { page: 'game'; id: string }
  | { page: 'library' }
  | { page: 'backup'; recover?: string }
  | { page: 'play'; id: string };

export type NavKey = 'store' | 'library' | 'backup';

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || 'store';
  if (h.startsWith('play-')) return { page: 'play', id: h.slice(5) };
  if (h.startsWith('game-')) return { page: 'game', id: h.slice(5) };
  if (h === 'library') return { page: 'library' };
  if (h === 'backup') return { page: 'backup' };
  if (h.startsWith('recover=')) return { page: 'backup', recover: safeDecode(h.slice(8)) };
  return { page: 'store' };
}

// 导航高亮跟着显示的页面走：详情归商店，恢复确认归存档
export const navOf = (r: Route): NavKey | undefined =>
  r.page === 'game' ? 'store' : r.page === 'play' ? undefined : r.page;

function safeDecode(s: string) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// 换到 h 页；已经在这页时不动
export function go(h: string) {
  if (location.hash.slice(1) !== h) location.hash = h;
}

// 不留历史记录地换掉地址里 # 之后的部分；history.replaceState 不发 hashchange，这里补发一次让订阅方重读
export function replaceHash(h: string) {
  history.replaceState(history.state, '', location.pathname + location.search + (h ? '#' + h : ''));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
