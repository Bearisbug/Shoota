// Service Worker 入口（ADR-009），构建成站点根下的 /sw.js（普通脚本，不是模块）。
// 安装时缓存平台页面与它引用的 /assets/*，装好立刻接管；缓存的平台页面原样含搬家检查脚本，地址里 # 之后的部分不经过这里。
// 要彻底撤掉时发一版只做注销的 sw.js（§23 发布）。

import { assetRefs, CACHES, route } from './routes';
import { respond, type SwDeps } from './strategies';

declare const self: ServiceWorkerGlobalScope;

const KEEP = new Set<string>(Object.values(CACHES));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const res = await fetch('/', { cache: 'no-cache' });
      if (!res.ok) return;
      const html = await res.clone().text();
      const shell = await caches.open(CACHES.shell);
      await shell.put('/', res);
      const assets = await caches.open(CACHES.assets);
      await Promise.all(assetRefs(html).map(u => assets.add(u).catch(() => {})));
    } catch { /* 装不上就每次走网络，和旧版相同 */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('shoota-') && !KEEP.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const r = route(req.method, new URL(req.url), self.location.origin);
  if (!r) return;
  const deps: SwDeps = { caches, fetch: q => fetch(q), waitUntil: p => event.waitUntil(p) };
  event.respondWith(respond(deps, r, req));
});
