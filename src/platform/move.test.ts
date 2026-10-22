import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../catalog';
import { Device, freshPlatform, settle } from './testing/env';
import { FakeCloud, installFetch } from './testing/server';

// 旧版 public/index.html（dd731d6）里元数据、统计上报、存档库、本机玩家、存档码解码与 moveIn 的原文，一字未改，当作对照实现；
// 末尾按旧版启动段的顺序调用：建本机玩家 → 地址带 #move= 时导入 → 领旅客编号 → 记一次访问
const OLD = String.raw`
const now = () => Date.now();
const findGame = id => GAME_IDS.includes(id) ? { id } : undefined;
/* ───────── 本机存储：localStorage 放账号与统计，IndexedDB 放各游戏存档 ───────── */
const META_KEY = 'changju.meta.v1';
const blank = () => ({ session:null, users:{}, stats:{}, wish:{}, achDefs:{}, sendLog:{} });
let hadMeta = false; // 打开页面前本机已有平台数据
let meta = (() => { try { const s = localStorage.getItem(META_KEY); if (s) { hadMeta = true; return Object.assign(blank(), JSON.parse(s)); } } catch (e) {} return blank(); })();
function persist(){ try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }

/* ───────── 匿名统计：每个浏览器一个随机旅客编号，上报到 /api/e，口径见 docs/DESIGN.md ───────── */
// 编号在搬家之后再领（FLOW-SAVE-MOVE S4）；领编号时本机已有平台数据的是统计上线前就玩过的老玩家，上报带 o
function ensureVid(prior){
  if (meta.vid) return;
  meta.vid = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  if (prior) meta.old = 1;
  persist();
}
function track(ev){
  const body = JSON.stringify(meta.old ? { v:meta.vid, o:1, ev:[ev] } : { v:meta.vid, ev:[ev] });
  if (navigator.sendBeacon && navigator.sendBeacon('/api/e', new Blob([body], { type:'application/json' }))) return;
  fetch('/api/e', { method:'POST', body, keepalive:true, headers:{ 'content-type':'application/json' } }).catch(() => {});
}

const IDB = (() => {
  const mem = { games:new Map(), kv:new Map() };
  let p = null;
  function open(){
    if (p) return p;
    p = new Promise(res => {
      try {
        const r = indexedDB.open('changju', 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('games', { keyPath:'id' }); d.createObjectStore('kv'); };
        r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
    return p;
  }
  function req(store, mode, make){
    return open().then(d => new Promise(res => {
      if (!d) return res(undefined);
      try { const q = make(d.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }
      catch (e) { res(undefined); }
    }));
  }
  return {
    async get(store, key){ const d = await open(); return d ? req(store, 'readonly', s => s.get(key)) : mem[store].get(key); },
    async put(store, val, key){ const d = await open(); if (!d) { mem[store].set(key ?? val.id, val); return; } return req(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)); }
  };
})();

/* ───────── 账号 ───────── */
const me = () => { const s = meta.session; return s && meta.users[s.email] ? { email:s.email, ...meta.users[s.email] } : null; };
function peek(gid, email = me()?.email){ return email && meta.stats[email] && meta.stats[email][gid] || null; }
function stat(gid){ const e = me()?.email; if (!e) return null; meta.stats[e] ??= {}; return meta.stats[e][gid] ??= { seconds:0, last:0, ach:{}, status:'' }; }
function hashId(s){ let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return 'u' + (h >>> 0).toString(16); }
function ensurePlayer(){
  if (meta.session && meta.users[meta.session.email]) return;
  meta.users.local ??= { nickname:'玩家', created:now() };
  meta.session = { email:'local', at:now() }; persist();
}
const gzip = (bytes, Stream) => new Response(new Blob([bytes]).stream().pipeThrough(new Stream('gzip'))).arrayBuffer().then(b => new Uint8Array(b));
async function decodeSaves(code){
  code = code.replace(/\s+/g, '');
  const tag = code.slice(0, 3);
  if (tag === 'CJ1' && !window.DecompressionStream) throw new Error('old');
  if (tag !== 'CJ0' && tag !== 'CJ1') throw new Error('bad');
  let bytes = Uint8Array.from(atob(code.slice(3)), c => c.charCodeAt(0));
  if (tag === 'CJ1') bytes = await gzip(bytes, DecompressionStream);
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (!d || d.v !== 1 || !d.saves || typeof d.saves !== 'object') throw new Error('bad');
  return d;
}
async function moveIn(){
  const h = location.hash.slice(6), i = h.indexOf('&r='), code = i < 0 ? h : h.slice(0, i);
  let st = null, back = '';
  try { st = localStorage.getItem('changju.moved'); back = i < 0 ? '' : decodeURIComponent(h.slice(i + 3)); } catch (e) {}
  history.replaceState(null, '', location.pathname + location.search + (back ? '#' + back : ''));
  if (!st || st === 'done') return false; // 本机没有发起搬家，地址里的数据不认
  try {
    if (!code) return false;
    const d = await decodeSaves(code), u = me();
    meta.stats[u.email] ??= {};
    for (const id of new Set([...Object.keys(d.saves), ...Object.keys(d.stats || {})])) {
      if (!findGame(id)) continue;
      const key = u.email + '|' + id, mine = peek(id), theirs = d.stats?.[id];
      if ((mine || await IDB.get('kv', key)) && (theirs?.seconds || 0) <= (mine?.seconds || 0)) continue; // 留累计时长更长的那份
      if (d.saves[id]) await IDB.put('kv', d.saves[id], key);
      if (theirs) meta.stats[u.email][id] = theirs;
      if (d.achDefs?.[id]) meta.achDefs[id] ??= d.achDefs[id];
    }
    meta.wish[u.email] = [...new Set([...(meta.wish[u.email] || []), ...(d.wish || []).filter(id => findGame(id))])];
    if (/^[0-9a-f]{32}$/.test(d.vid || '') && d.vid !== meta.vid) {
      if (meta.vid) fetch('/api/merge', { method:'POST', body:JSON.stringify({ v:d.vid, from:meta.vid }), keepalive:true, headers:{ 'content-type':'application/json' } }).catch(() => {});
      meta.vid = d.vid;
    }
    persist();
    return Boolean(d.had);
  } catch (e) { return false; }
  finally { try { localStorage.setItem('changju.moved', 'done'); } catch (e) {} }
}
ensurePlayer();
return (async () => {
  const had = location.hash.startsWith('#move=') && await moveIn();
  ensureVid(hadMeta || had);
  track({ t:'visit' });
})();`;
const runOld = (): Promise<void> => new Function('GAME_IDS', "'use strict';" + OLD)(CATALOG.map(g => g.id));

const MINE = 'a'.repeat(32), THEIRS = 'c'.repeat(32);
// https 下这台浏览器已有的数据
const LOCAL_META = {
  session:{ email:'local', at:1 }, users:{ local:{ nickname:'玩家', created:1 } },
  stats:{ local:{ yike:{ seconds:600, last:10, ach:{}, status:'第 5 关' }, f1:{ seconds:30, last:11, ach:{}, status:'' }, nba:{ seconds:0, last:12, ach:{}, status:'' } } },
  wish:{ local:['lol'] }, achDefs:{}, sendLog:{}, vid:MINE,
};
// http 下搬家页带回的数据
const PACK = {
  v:1, at:1761100000000,
  saves:{ yike:{ k:'http' }, douluo:{ d:'http' }, f1:{ f:'http' }, nba:{ n:'http' }, ghost:{ g:'1' } },
  stats:{ yike:{ seconds:100, last:1, ach:{}, status:'' }, douluo:{ seconds:50, last:2, ach:{}, status:'' }, f1:{ seconds:90, last:3, ach:{ w:5 }, status:'f' },
    nba:{ seconds:0, last:4, ach:{}, status:'' }, hougong:{ seconds:7, last:5, ach:{}, status:'h' } },
  wish:['douluo', 'ghost', 'lol'], achDefs:{ douluo:[{ key:'a', name:'A' }], f1:[{ key:'w', name:'W' }] }, vid:THEIRS, had:true,
};

interface Seed { meta?: object; saves?: Record<string, object>; moved?: string; hash: string }
interface Outcome { storage: [string, string][]; kv: [string, unknown][]; url: string; merges: unknown[]; visits: unknown[]; ret?: boolean }

let n = 0;
function seeded(s: Seed){
  const dev = new Device().install();
  if (s.meta) dev.storage.setItem('changju.meta.v1', JSON.stringify(s.meta));
  if (s.moved) dev.storage.setItem('changju.moved', s.moved);
  for (const [k, v] of Object.entries(s.saves || {})) dev.idb.seed(k, v);
  dev.location.hash = s.hash;
  dev.nav.onLine = false; // 新版启动时的云同步不在这一组里比
  return dev;
}
async function outcome(dev: Device, server: FakeCloud): Promise<Outcome> {
  await settle(50);
  return {
    storage:[...dev.storage.map].filter(([k]) => k !== 'changju.cloud.v1').sort(),
    kv:[...dev.idb.kv()].sort(),
    url:dev.location.pathname + dev.location.search + dev.location.hash,
    merges:server.other.filter(r => r.path === '/api/merge').map(r => ({ body:r.body, keepalive:r.keepalive })),
    visits:await dev.collected(),
  };
}
// 同一份种子分别交给旧版与新版，比较两边的本机存储、地址、合并请求与访问上报
async function both(s: Seed){
  // 两边领编号、生成云存档编号用同一串「随机数」，结果才能逐字比较
  const rnd = () => vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView>(a: T) => { new Uint8Array(a.buffer).forEach((_, i, b) => { b[i] = (i * 37 + ++n) & 255; }); return a; });
  let server = new FakeCloud(); installFetch(server); n = 0; rnd();
  const oldDev = seeded(s); await runOld(); const old = await outcome(oldDev, server);
  server = new FakeCloud(); installFetch(server); n = 0; rnd();
  const newDev = seeded(s), P = await freshPlatform(); await P.boot(); const neu = await outcome(newDev, server);
  vi.restoreAllMocks();
  return { old, neu, newDev };
}

let code = '';
beforeEach(async () => {
  vi.useFakeTimers({ toFake:['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1761200000000);
  new Device().install();
  code = await (await freshPlatform()).encodeSaves(PACK as never);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('moveIn 与旧版逐项相同', () => {
  it('本机发起了搬家：每款留累计时长更长的那份，愿望单取并集，改用旧编号并请求合并', async () => {
    const { old, neu, newDev } = await both({ meta:LOCAL_META, saves:{ 'local|yike':{ k:'https' } }, moved:'1', hash:'#move=' + code + '&r=' + encodeURIComponent('game-yike') });
    expect(neu).toEqual(old);
    const m = newDev.meta();
    expect(neu.url).toBe('/#game-yike');
    expect(newDev.storage.getItem('changju.moved')).toBe('done');
    expect(newDev.idb.kv().get('local|yike')).toEqual({ k:'https' }); // 本机 600 秒比 100 秒长
    expect(newDev.idb.kv().get('local|douluo')).toEqual({ d:'http' });
    expect(newDev.idb.kv().get('local|f1')).toEqual({ f:'http' });
    expect(newDev.idb.kv().has('local|nba')).toBe(false); // 两边都是 0 秒，留本机那份
    expect(newDev.idb.kv().has('local|ghost')).toBe(false);
    expect(m.stats.local.hougong).toEqual(PACK.stats.hougong); // 只有时长没有存档的也搬
    expect(m.achDefs).toEqual({ douluo:PACK.achDefs.douluo, f1:PACK.achDefs.f1 });
    expect(m.wish.local).toEqual(['lol', 'douluo']);
    expect(m.vid).toBe(THEIRS);
    expect(neu.merges).toEqual([{ body:{ v:THEIRS, from:MINE }, keepalive:true }]);
    expect(neu.visits).toEqual([{ v:THEIRS, ev:[{ t:'visit' }] }]);
  });

  it('https 下还没有编号：直接用旧编号，不请求合并', async () => {
    const { old, neu, newDev } = await both({ moved:'1', hash:'#move=' + code + '&r=' });
    expect(neu).toEqual(old);
    expect(neu.merges).toEqual([]);
    expect(newDev.meta().vid).toBe(THEIRS);
    expect(neu.url).toBe('/');
  });

  it('本机没发起搬家时地址带着搬家数据：不导入，只去掉地址里的数据，下次打开照常去查', async () => {
    const { old, neu, newDev } = await both({ meta:LOCAL_META, hash:'#move=' + code + '&r=backup' });
    expect(neu).toEqual(old);
    expect(neu.url).toBe('/#backup');
    expect(newDev.storage.getItem('changju.moved')).toBeNull();
    expect(newDev.meta().vid).toBe(MINE);
    expect(newDev.idb.kv().size).toBe(0);
  });

  it('搬家页带回「无数据」：不导入，标记查完了', async () => {
    const { old, neu, newDev } = await both({ moved:'2', hash:'#move=&r=store' });
    expect(neu).toEqual(old);
    expect(newDev.storage.getItem('changju.moved')).toBe('done');
    expect(newDev.meta().old).toBeUndefined();
  });

  it('带回的数据读不出：不导入，标记查完了，平台照常打开', async () => {
    const { old, neu, newDev } = await both({ meta:LOCAL_META, moved:'1', hash:'#move=CJ1@@@&r=library' });
    expect(neu).toEqual(old);
    expect(newDev.storage.getItem('changju.moved')).toBe('done');
    expect(neu.url).toBe('/#library');
  });

  it('http 下有存档但没有编号：新领的编号标为老玩家', async () => {
    const noVid = await (await freshPlatform()).encodeSaves({ ...PACK, vid:undefined } as never);
    const { old, neu, newDev } = await both({ moved:'1', hash:'#move=' + noVid });
    expect(neu).toEqual(old);
    expect(newDev.meta().old).toBe(1);
    expect(neu.visits).toEqual([{ v:newDev.meta().vid, o:1, ev:[{ t:'visit' }] }]);
  });
});

describe('平台启动与访问上报（FLOW-COLLECT）', () => {
  it('搬家检查正在跳去搬家页时平台整体不启动：不建玩家、不领编号、不上报', async () => {
    const dev = new Device().install();
    (globalThis as { __cjMoving?: boolean }).__cjMoving = true;
    try {
      const P = await freshPlatform();
      expect(await P.boot()).toBe(false);
      expect(dev.storage.map.size).toBe(0);
      expect(dev.beacons).toEqual([]);
    } finally { delete (globalThis as { __cjMoving?: boolean }).__cjMoving; }
  });

  it('每次加载发一次 visit；老玩家每一批都带 o；sendBeacon 不收时改用 fetch keepalive', async () => {
    const dev = new Device().install(), server = new FakeCloud(); installFetch(server);
    dev.nav.onLine = false;
    dev.storage.setItem('changju.meta.v1', JSON.stringify({ ...LOCAL_META, old:1 }));
    const P = await freshPlatform();
    await P.boot();
    expect(await dev.collected()).toEqual([{ v:MINE, o:1, ev:[{ t:'visit' }] }]);
    dev.nav.sendBeacon.mockReturnValue(false);
    P.track({ t:'start', g:'yike' });
    P.track({ t:'play', g:'yike', s:120 });
    expect(server.other.map(r => [r.path, r.keepalive, r.body])).toEqual([
      ['/api/e', true, { v:MINE, o:1, ev:[{ t:'start', g:'yike' }] }],
      ['/api/e', true, { v:MINE, o:1, ev:[{ t:'play', g:'yike', s:120 }] }],
    ]);
  });
});
