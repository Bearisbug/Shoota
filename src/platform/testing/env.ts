// 单测用的浏览器环境：localStorage、IndexedDB、window、document、location、history、navigator 都是内存假件。
// 一台 Device 是一个浏览器；install() 把它装成全局。同一台设备里再用 freshPlatform() 取一份新的模块实例，就是又开了一个标签页。
import { vi } from 'vitest';

const tick = (fn: () => void) => { void Promise.resolve().then(fn); };
const def = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable:true, writable:true });

export class FakeStorage {
  map = new Map<string, string>();
  failWrites = false;
  get length(){ return this.map.size; }
  key(i: number){ return [...this.map.keys()][i] ?? null; }
  getItem(k: string){ return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string){ if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError'); this.map.set(k, String(v)); }
  removeItem(k: string){ this.map.delete(k); }
  clear(){ this.map.clear(); }
}

/* ───────── IndexedDB：只做平台用到的 open、两个库、get/put/delete 与事务 ───────── */
type Fn = (() => void) | null;
class Req<T = unknown> {
  result = undefined as T; error: DOMException | null = null;
  onsuccess: Fn = null; onerror: Fn = null; onupgradeneeded: Fn = null; onblocked: Fn = null;
  transaction: { abort(): void } | null = null;
}
interface StoreData { keyPath?: string; data: Map<string, unknown> }
interface DbData { version: number; stores: Map<string, StoreData> }

export interface IdbKnobs {
  hangOpen: boolean; // open 一直不回调
  failOpen: boolean;
  hangTx: boolean; // 事务一直不完成
  failGet: ((key: string) => boolean) | null;
  failPut: boolean;
}

export class FakeIndexedDB {
  dbs = new Map<string, DbData>();
  knobs: IdbKnobs = { hangOpen:false, failOpen:false, hangTx:false, failGet:null, failPut:false };
  opens = 0;
  open(name: string, version?: number){
    this.opens++;
    const r = new Req<FakeDB>();
    tick(() => {
      if (this.knobs.hangOpen) return;
      if (this.knobs.failOpen) { r.error = new DOMException('lost', 'UnknownError'); r.onerror?.(); return; }
      let d = this.dbs.get(name);
      const v = version ?? d?.version ?? 1;
      if (d && v < d.version) { r.error = new DOMException('version', 'VersionError'); r.onerror?.(); return; }
      const db = new FakeDB(this, name);
      if (!d || v > d.version) {
        if (!d) { d = { version:0, stores:new Map() }; this.dbs.set(name, d); }
        d.version = v; r.result = db; r.transaction = { abort(){} };
        r.onupgradeneeded?.();
      }
      r.result = db; r.onsuccess?.();
    });
    return r;
  }
  // 预置一份旧版留下的数据：库 changju 第 1 版，kv 与 games 两个库
  seed(key: string, value: unknown){
    let d = this.dbs.get('changju');
    if (!d) { d = { version:1, stores:new Map([['games', { keyPath:'id', data:new Map() }], ['kv', { data:new Map() }]]) }; this.dbs.set('changju', d); }
    d.stores.get('kv')!.data.set(key, structuredClone(value));
  }
  kv(){ return this.dbs.get('changju')?.stores.get('kv')?.data ?? new Map<string, unknown>(); }
}

class FakeDB {
  onversionchange: Fn = null; onclose: Fn = null; closed = false;
  constructor(readonly idb: FakeIndexedDB, readonly name: string){}
  get data(){ return this.idb.dbs.get(this.name)!; }
  get objectStoreNames(){ const n = [...this.data.stores.keys()]; return Object.assign(n, { contains:(x: string) => n.includes(x) }); }
  createObjectStore(name: string, o?: { keyPath?: string }){ this.data.stores.set(name, { keyPath:o?.keyPath, data:new Map() }); return {}; }
  transaction(names: string | string[], mode: 'readonly' | 'readwrite' = 'readonly'){
    if (this.closed) throw new DOMException('closed', 'InvalidStateError');
    return new FakeTx(this, ([] as string[]).concat(names), mode);
  }
  close(){ this.closed = true; }
}

class FakeTx {
  oncomplete: Fn = null; onerror: Fn = null; onabort: Fn = null; error: DOMException | null = null;
  private ops: (() => boolean)[] = [];
  private done = false;
  private work = new Map<string, Map<string, unknown>>();
  constructor(private db: FakeDB, private names: string[], readonly mode: 'readonly' | 'readwrite'){ tick(() => { void this.run(); }); }
  objectStore(name: string){
    if (!this.names.includes(name)) throw new DOMException('store', 'NotFoundError');
    const req = (fn: (m: Map<string, unknown>) => unknown, fail: boolean) => {
      const r = new Req();
      this.ops.push(() => {
        if (fail) { r.error = new DOMException('io', 'UnknownError'); r.onerror?.(); return false; }
        r.result = fn(this.store(name)); r.onsuccess?.(); return true;
      });
      return r;
    };
    const k = this.db.idb.knobs;
    return {
      get:(key: string) => req(m => structuredClone(m.get(key)), !!k.failGet?.(key)),
      put:(value: unknown, key: string) => { const v = structuredClone(value); return req(m => { m.set(key, v); return key; }, k.failPut); },
      delete:(key: string) => req(m => { m.delete(key); }, k.failPut),
    };
  }
  private store(name: string){
    let m = this.work.get(name);
    if (!m) { m = new Map(this.db.data.stores.get(name)!.data); this.work.set(name, m); }
    return m;
  }
  private async run(){
    if (this.db.idb.knobs.hangTx) return;
    while (this.ops.length && !this.done) {
      if (!this.ops.shift()!()) { this.done = true; this.error = new DOMException('io', 'UnknownError'); this.onerror?.(); this.onabort?.(); return; }
      await Promise.resolve();
    }
    if (this.done) return;
    this.done = true;
    if (this.mode === 'readwrite') for (const [n, m] of this.work) this.db.data.stores.get(n)!.data = m;
    this.oncomplete?.();
  }
  abort(){ if (this.done) return; this.done = true; this.error = new DOMException('abort', 'AbortError'); tick(() => this.onabort?.()); }
}

/* ───────── Web Locks：一台设备一份，同一设备的标签页共用，不同设备互不影响 ───────── */
type LockCb = (lock: { name: string } | null) => unknown;
export class FakeLocks {
  private held = new Set<string>();
  private waiting = new Map<string, (() => void)[]>();
  async request(name: string, a: { ifAvailable?: boolean } | LockCb, b?: LockCb){
    const opts = typeof a === 'function' ? {} : a, cb = (typeof a === 'function' ? a : b)!;
    if (this.held.has(name)) {
      if (opts.ifAvailable) return cb(null);
      await new Promise<void>(r => { const q = this.waiting.get(name) ?? []; q.push(r); this.waiting.set(name, q); });
    }
    this.held.add(name);
    try { return await cb({ name }); }
    finally { const next = this.waiting.get(name)?.shift(); if (next) next(); else this.held.delete(name); }
  }
}

/* ───────── 一台设备（一个浏览器） ───────── */

export interface Beacon { url: string; data: Blob }

export class Device {
  storage = new FakeStorage();
  idb = new FakeIndexedDB();
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { hidden:false });
  location = { protocol:'https:', host:'shoota.ai', hostname:'shoota.ai', origin:'https://shoota.ai', pathname:'/', search:'', hash:'' };
  beacons: Beacon[] = [];
  nav = {
    locks:new FakeLocks() as unknown as LockManager | undefined,
    onLine:true,
    userAgent:'vitest',
    sendBeacon:vi.fn((url: string, data: Blob) => { this.beacons.push({ url, data }); return true; }),
    storage:{ persist:vi.fn(async () => true) },
  };
  history = {
    replaceState:(_s: unknown, _t: string, url: string) => {
      const u = new URL(url, this.location.origin + this.location.pathname);
      this.location.pathname = u.pathname; this.location.search = u.search; this.location.hash = u.hash;
    },
  };
  install(){
    def('localStorage', this.storage);
    def('indexedDB', this.idb);
    def('window', globalThis);
    def('document', this.doc);
    def('location', this.location);
    def('history', this.history);
    def('navigator', this.nav);
    def('addEventListener', this.win.addEventListener.bind(this.win));
    def('removeEventListener', this.win.removeEventListener.bind(this.win));
    def('dispatchEvent', this.win.dispatchEvent.bind(this.win));
    return this;
  }
  setHidden(hidden: boolean){ this.doc.hidden = hidden; this.doc.dispatchEvent(new Event('visibilitychange')); }
  // sendBeacon 发出的上报，按发出顺序
  async collected(){ return Promise.all(this.beacons.filter(b => b.url === '/api/e').map(async b => JSON.parse(await b.data.text()))); }
  meta(){ return JSON.parse(this.storage.getItem('changju.meta.v1') || 'null'); }
  cloud(){ return JSON.parse(this.storage.getItem('changju.cloud.v1') || 'null'); }
}

// 新开一个标签页：同一台设备上的平台模块重新实例化
export async function freshPlatform(){
  vi.resetModules();
  const [index, idb, cloud, cloudState, metaMod, undo] = await Promise.all([import('../index'), import('../idb'), import('../cloud'), import('../cloudState'), import('../meta'), import('../undo')]);
  return { ...index, idb, cloud, cloudState, metaMod, undo };
}
export type Platform = Awaited<ReturnType<typeof freshPlatform>>;

// 等微任务与假件的异步回调都跑完
export async function settle(n = 20){ for (let i = 0; i < n; i++) await Promise.resolve(); }
