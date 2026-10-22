// Service Worker 管哪些请求、怎么管（ADR-009，§15 缓存）：只管平台页面、/assets/*、游戏文件与封面，接口一律直连。
// - 平台页面 / 与改写游戏页 /play/<游戏>/：先给缓存的那份，后台取新版，下次打开生效
// - /assets/* 与带摘要的游戏文件 /g/<游戏>-<摘要>：文件名带摘要，缓存优先
// - 固定地址的旧游戏文件 /games/<游戏>：内容会变，先走网络，断网时给缓存
// - 封面 /covers/*：先给缓存，后台更新
// 其余（/api、/kanban、/move、/brand、搬家页等）不经 Service Worker。

export type Route =
  | { kind: 'shell'; key: string } // 缓存键：/ 或 /play/<游戏>/
  | { kind: 'asset' }
  | { kind: 'game'; gid: string } // /g/<游戏>-<摘要>
  | { kind: 'game-fixed' } // /games/<游戏>
  | { kind: 'cover' }
  | null;

export const CACHES = {
  shell: 'shoota-shell-v1',
  assets: 'shoota-assets-v1',
  games: 'shoota-games-v1',
  covers: 'shoota-covers-v1',
} as const;

export const ASSETS_MAX = 300; // /assets/* 最多留这么多条，超出先删最早放进去的

// 第 1 组是游戏标识；标识本身可以带连字符（f1 与 f1-driver），按整段比对，不按前缀
export const HASHED_GAME = /^\/g\/([a-z0-9-]+)-[0-9a-f]{8}$/;
const PLAY_PAGE = /^\/play\/([\w-]+)\/(?:index\.html)?$/;

export function route(method: string, url: URL, origin: string): Route {
  if (method !== 'GET' || url.origin !== origin) return null;
  const p = url.pathname;
  if (p === '/' || p === '/index.html') return { kind: 'shell', key: '/' };
  const play = PLAY_PAGE.exec(p);
  if (play) return { kind: 'shell', key: `/play/${play[1]}/` };
  if (p.startsWith('/assets/')) return { kind: 'asset' };
  const g = HASHED_GAME.exec(p);
  if (g) return { kind: 'game', gid: g[1] };
  if (/^\/games\/[\w-]+(?:\.html)?$/.test(p)) return { kind: 'game-fixed' };
  if (p.startsWith('/covers/')) return { kind: 'cover' };
  return null;
}

// 平台页面引用的 /assets/*，安装时一起放进缓存
export function assetRefs(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) out.add(m[1]);
  return [...out];
}
