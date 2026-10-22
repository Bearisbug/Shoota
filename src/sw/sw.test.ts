// Service Worker 的路由与取法（ADR-009，§15 缓存），用内存缓存与假网络驱动。
import { describe, expect, it, vi } from 'vitest';
import { CACHE_HIT_HEADER } from './constants';
import { assetRefs, CACHES, route } from './routes';
import { respond, type SwDeps } from './strategies';

const O = 'https://shoota.ai';
const at = (p: string, method = 'GET') => route(method, new URL(p, O), O);

describe('哪些请求归 Service Worker 管', () => {
  it('平台页面、改写游戏页、/assets、游戏文件与封面', () => {
    expect(at('/')).toEqual({ kind: 'shell', key: '/' });
    expect(at('/?utm=1')).toEqual({ kind: 'shell', key: '/' });
    expect(at('/play/yike/')).toEqual({ kind: 'shell', key: '/play/yike/' });
    expect(at('/assets/index-abc123.js')).toEqual({ kind: 'asset' });
    expect(at('/g/yike-0123abcd')).toEqual({ kind: 'game', gid: 'yike' });
    expect(at('/g/basketball-star-0123abcd')).toEqual({ kind: 'game', gid: 'basketball-star' });
    expect(at('/games/yike')).toEqual({ kind: 'game-fixed' });
    expect(at('/covers/yike.jpg')).toEqual({ kind: 'cover' });
  });

  it('接口、看板、搬家页、品牌资源、别的站点与非 GET 一律直连', () => {
    for (const p of ['/api/e', '/api/launch', '/api/cloud/sync', '/kanban', '/kanban/assets/x.js', '/move', '/move.html', '/brand/tokens.css', '/sw.js', '/manifest.webmanifest']) {
      expect(at(p), p).toBeNull();
    }
    expect(at('/assets/x.js', 'POST')).toBeNull();
    expect(route('GET', new URL('https://fonts.example/assets/a.css'), O)).toBeNull();
  });

  it('安装时从平台页面里找出它引用的 /assets', () => {
    const html = '<script type="module" crossorigin src="/assets/index-a1.js"></script><link rel="stylesheet" href="/assets/index-b2.css"><link rel="icon" href="/brand/x.svg"><link href="/assets/index-a1.js">';
    expect(assetRefs(html)).toEqual(['/assets/index-a1.js', '/assets/index-b2.css']);
  });
});

// 内存里的 CacheStorage，只实现用到的几个方法；键按放入顺序排
function memCaches() {
  const store = new Map<string, Map<string, Response>>();
  const keyOf = (k: string | Request) => new URL(typeof k === 'string' ? k : k.url, O).href;
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    const cache = {
      match: async (k: string | Request) => m.get(keyOf(k))?.clone(),
      put: async (k: string | Request, r: Response) => {
        const body = await r.arrayBuffer();
        m.delete(keyOf(k));
        m.set(keyOf(k), new Response(body, { status: r.status, headers: r.headers }));
      },
      keys: async () => [...m.keys()].map(u => new Request(u)),
      delete: async (k: string | Request) => m.delete(keyOf(k)),
    };
    return cache as unknown as Cache;
  };
  return { caches: { open } as unknown as CacheStorage, store };
}

function harness(net: (req: Request) => Promise<Response>) {
  const mem = memCaches();
  const pending: Promise<unknown>[] = [];
  const fetch = vi.fn(net);
  const deps: SwDeps = { caches: mem.caches, fetch, waitUntil: p => { pending.push(p); } };
  const get = async (p: string) => {
    const req = new Request(new URL(p, O));
    const res = await respond(deps, route('GET', new URL(req.url), O)!, req);
    await Promise.all(pending.splice(0));
    return res;
  };
  return { get, fetch, mem };
}

const ok = (body: string) => async () => new Response(body, { status: 200 });

describe('取法', () => {
  it('带摘要的游戏文件：第二次打开不发网络请求，响应带来自缓存的标记', async () => {
    const h = harness(ok('<html>斗罗</html>'));
    const first = await h.get('/g/douluo-0123abcd');
    expect(first.headers.get(CACHE_HIT_HEADER)).toBeNull();
    expect(await first.text()).toBe('<html>斗罗</html>');
    const second = await h.get('/g/douluo-0123abcd');
    expect(second.headers.get(CACHE_HIT_HEADER)).toBe('1');
    expect(await second.text()).toBe('<html>斗罗</html>');
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('每款游戏只留一个版本', async () => {
    const h = harness(ok('x'));
    await h.get('/g/douluo-0123abcd');
    await h.get('/g/yike-11111111');
    await h.get('/g/douluo-ffffffff');
    const keys = [...h.mem.store.get(CACHES.games)!.keys()].map(u => new URL(u).pathname);
    expect(keys.sort()).toEqual(['/g/douluo-ffffffff', '/g/yike-11111111']);
  });

  it('标识是另一款前缀的游戏各留各的：先开 F1-Driver 再开 F1-Team Principal，两份都在', async () => {
    const h = harness(ok('x'));
    await h.get('/g/f1-driver-0123abcd');
    await h.get('/g/f1-89abcdef');
    const keys = [...h.mem.store.get(CACHES.games)!.keys()].map(u => new URL(u).pathname);
    expect(keys.sort()).toEqual(['/g/f1-89abcdef', '/g/f1-driver-0123abcd']);
    await h.get('/g/f1-driver-0123abcd');
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('出错的响应不缓存', async () => {
    const h = harness(async () => new Response('missing', { status: 404 }));
    expect((await h.get('/g/douluo-0123abcd')).status).toBe(404);
    await h.get('/g/douluo-0123abcd');
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('平台页面：先给缓存的那份，后台取新版，下次打开生效', async () => {
    let version = 'v1';
    const h = harness(async () => new Response(version, { status: 200 }));
    expect(await (await h.get('/')).text()).toBe('v1');
    version = 'v2';
    const stale = await h.get('/');
    expect(await stale.text()).toBe('v1');
    expect(stale.headers.get(CACHE_HIT_HEADER)).toBe('1');
    expect(await (await h.get('/')).text()).toBe('v2');
  });

  it('平台页面在断网时照样打开缓存的那份', async () => {
    let online = true;
    const h = harness(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return new Response('page', { status: 200 });
    });
    await h.get('/');
    online = false;
    expect(await (await h.get('/')).text()).toBe('page');
  });

  it('固定地址的旧游戏文件先走网络，断网时给缓存', async () => {
    let online = true;
    const h = harness(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return new Response('game', { status: 200 });
    });
    expect((await h.get('/games/douluo')).headers.get(CACHE_HIT_HEADER)).toBeNull();
    online = false;
    const res = await h.get('/games/douluo');
    expect(res.headers.get(CACHE_HIT_HEADER)).toBe('1');
    expect(await res.text()).toBe('game');
    await expect(h.get('/games/yike')).rejects.toThrow('Failed to fetch');
  });

  it('/assets 超过 300 条先删最早放进去的', async () => {
    const h = harness(ok('a'));
    for (let i = 0; i < 302; i++) await h.get(`/assets/a${i}.js`);
    const keys = [...h.mem.store.get(CACHES.assets)!.keys()].map(u => new URL(u).pathname);
    expect(keys).toHaveLength(300);
    expect(keys[0]).toBe('/assets/a2.js');
  });
});
