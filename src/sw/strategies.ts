// 三种取法，依赖从参数传入，单测里换成内存缓存与假网络。
// 从缓存给出的响应都加 x-shoota-cache: 1，启动遥测据此填「来自缓存」。

import { CACHE_HIT_HEADER } from './constants';
import { ASSETS_MAX, CACHES, HASHED_GAME, type Route } from './routes';

export interface SwDeps {
  caches: CacheStorage;
  fetch: (req: Request) => Promise<Response>;
  /** 响应已经给出、还要接着做的事（后台更新、写缓存），浏览器据此不提前停掉 Service Worker */
  waitUntil: (p: Promise<unknown>) => void;
}

const cacheable = (r: Response) => r.ok && r.status === 200 && (r.type === 'basic' || r.type === 'default');

export function markCached(r: Response): Response {
  const headers = new Headers(r.headers);
  headers.set(CACHE_HIT_HEADER, '1');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
}

async function put(deps: SwDeps, name: string, key: string | Request, res: Response, after?: (c: Cache) => Promise<void>) {
  try {
    const c = await deps.caches.open(name);
    await c.put(key, res);
    if (after) await after(c);
  } catch { /* 没下完（被取消或断网）就不缓存 */ }
}

// 缓存优先：有就给缓存的，没有就走网络并放进缓存
async function cacheFirst(deps: SwDeps, name: string, req: Request, after?: (c: Cache) => Promise<void>): Promise<Response> {
  const c = await deps.caches.open(name);
  const hit = await c.match(req);
  if (hit) return markCached(hit);
  const res = await deps.fetch(req);
  if (cacheable(res)) deps.waitUntil(put(deps, name, req, res.clone(), after));
  return res;
}

// 先给缓存，后台取新版；缓存里没有就等网络
async function staleWhileRevalidate(deps: SwDeps, name: string, req: Request, key: string | Request): Promise<Response> {
  const c = await deps.caches.open(name);
  const hit = await c.match(key);
  const update = deps.fetch(req).then(res => {
    if (cacheable(res)) deps.waitUntil(put(deps, name, key, res.clone()));
    return res;
  });
  if (hit) {
    deps.waitUntil(update.catch(() => {}));
    return markCached(hit);
  }
  return update;
}

// 先走网络，断网时给缓存
async function networkFirst(deps: SwDeps, name: string, req: Request): Promise<Response> {
  try {
    const res = await deps.fetch(req);
    if (cacheable(res)) deps.waitUntil(put(deps, name, req, res.clone()));
    return res;
  } catch (e) {
    const hit = await (await deps.caches.open(name)).match(req);
    if (hit) return markCached(hit);
    throw e;
  }
}

// 每款游戏只留一个版本：放进新版后删掉同一款的其他摘要
const keepOneVersion = (gid: string, keep: string) => async (c: Cache) => {
  for (const k of await c.keys()) {
    const p = new URL(k.url).pathname;
    if (HASHED_GAME.exec(p)?.[1] === gid && p !== keep) await c.delete(k);
  }
};

// 超出条数先删最早放进去的（keys 按放入顺序）
const trimTo = (max: number) => async (c: Cache) => {
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
};

export function respond(deps: SwDeps, r: NonNullable<Route>, req: Request): Promise<Response> {
  switch (r.kind) {
    case 'shell': return staleWhileRevalidate(deps, CACHES.shell, req, r.key);
    case 'asset': return cacheFirst(deps, CACHES.assets, req, trimTo(ASSETS_MAX));
    case 'game': return cacheFirst(deps, CACHES.games, req, keepOneVersion(r.gid, new URL(req.url).pathname));
    case 'game-fixed': return networkFirst(deps, CACHES.games, req);
    case 'cover': return staleWhileRevalidate(deps, CACHES.covers, req, req);
  }
}
