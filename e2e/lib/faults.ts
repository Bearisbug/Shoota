// 注入脚本（docs/TEST.md §3「注入脚本」）：用 addInitScript 装进平台页面与游戏 iframe，开关在平台页面的 window.__faults 上，默认全关。
// - 存档库：idb 为 hang 时打开存档库与只读事务永远不回调，为 error 时回调错误；读写事务照常，平台若把空存档写回会真的写进去；
// - 丢掉就绪信号：平台页面收到旧运行层的 boot-ready 与 SDK 的 ready 时不交给平台的监听；
// - 全屏与方向锁定：记下平台页面的每次 requestFullscreen 与 screen.orientation.lock，可让它们照常或拒绝；
// - 页面内消息：记下平台页面收到的、以及同源游戏页收到的 shoota 与 Platform 1.0 消息。
import type { BrowserContext, Page } from '@playwright/test';

export type IdbFault = 'off' | 'hang' | 'error';
export type CallMode = 'pass' | 'reject';

export interface FaultSwitches { idb: IdbFault; dropReady: boolean; fullscreen: CallMode; lock: CallMode }

export interface FsCall { kind: 'fullscreen' | 'lock'; target: string; arg: string; active: boolean; at: number }

export interface MsgRecord {
  to: 'platform' | 'game';
  type: string;
  ns?: string;
  sdk?: number;
  cj?: number;
  reason?: string;
  dropped: boolean;
  at: number;
}

interface Hooks { __faults: FaultSwitches; __fsCalls: FsCall[]; __msgs: MsgRecord[] }

function install(init: Partial<FaultSwitches>) {
  type Msg = { ns?: unknown; sdk?: unknown; type?: unknown; __cj?: unknown; reason?: unknown } | null;
  const record = (to: MsgRecord['to'], d: Msg, dropped: boolean): MsgRecord | null =>
    d && typeof d === 'object' && (d.ns === 'shoota' || d.__cj === 1)
      ? { to, type: String(d.type), ns: d.ns as string | undefined, sdk: d.sdk as number | undefined, cj: d.__cj as number | undefined,
        reason: d.reason as string | undefined, dropped, at: Date.now() }
      : null;

  if (window !== window.top) {
    // 同源的改写游戏页：把平台发来的消息记到平台页面上；沙箱里的旧游戏够不着平台页面，直接跳过
    window.addEventListener('message', e => {
      try {
        const r = record('game', e.data as Msg, false);
        if (r) (window.top as unknown as Hooks).__msgs.push(r);
      } catch { /* 跨源 */ }
    }, true);
    return;
  }

  const w = window as unknown as Hooks;
  const F: FaultSwitches = { idb: 'off', dropReady: false, fullscreen: 'pass', lock: 'pass', ...init };
  w.__faults = F;
  w.__fsCalls = [];
  w.__msgs = [];

  // 存档库：假的请求与事务，按开关不回调或回调错误
  class FakeRequest extends EventTarget {
    onsuccess: ((e: Event) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    onupgradeneeded: ((e: Event) => void) | null = null;
    onblocked: ((e: Event) => void) | null = null;
    result: undefined;
    error: DOMException | null = null;
    readyState = 'pending';
    fire(type: 'error') {
      this.error = new DOMException('注入的存档库错误', 'UnknownError');
      this.readyState = 'done';
      const ev = new Event(type, { cancelable: true });
      this.dispatchEvent(ev);
      this.onerror?.call(this, ev);
    }
  }
  class FakeTransaction extends EventTarget {
    oncomplete: ((e: Event) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    onabort: ((e: Event) => void) | null = null;
    error: DOMException | null = null;
    private reqs: FakeRequest[] = [];
    constructor(mode: IdbFault) {
      super();
      if (mode === 'error') setTimeout(() => {
        for (const r of this.reqs) r.fire('error');
        this.error = new DOMException('注入的存档库错误', 'UnknownError');
        const ev = new Event('error');
        this.dispatchEvent(ev);
        this.onerror?.call(this, ev);
        const ab = new Event('abort');
        this.dispatchEvent(ab);
        this.onabort?.call(this, ab);
      }, 0);
    }
    objectStore() {
      const req = () => { const r = new FakeRequest(); this.reqs.push(r); return r; };
      return { get: req, getAll: req, getAllKeys: req, count: req, put: req, add: req, delete: req, clear: req };
    }
    abort() {}
  }
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<IDBFactory['open']>) {
    if (F.idb === 'off') return open.apply(this, a);
    const r = new FakeRequest();
    if (F.idb === 'error') setTimeout(() => r.fire('error'), 0);
    return r as unknown as IDBOpenDBRequest;
  };
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...a: Parameters<IDBDatabase['transaction']>) {
    if (F.idb === 'off' || a[1] === 'readwrite') return transaction.apply(this, a);
    return new FakeTransaction(F.idb) as unknown as IDBTransaction;
  } as IDBDatabase['transaction'];

  // 就绪信号与消息记录：包住平台页面上的 message 监听
  const isReady = (d: Msg) => !!d && typeof d === 'object'
    && ((d.__cj === 1 && d.type === 'boot-ready') || (d.ns === 'shoota' && d.sdk === 2 && d.type === 'ready'));
  const add = window.addEventListener, remove = window.removeEventListener;
  const wrapped = new WeakMap<object, EventListener>();
  add.call(window, 'message', (e: Event) => {
    const d = (e as MessageEvent).data as Msg;
    const r = record('platform', d, F.dropReady && isReady(d));
    if (r) w.__msgs.push(r);
  }, true);
  window.addEventListener = function (this: Window, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
    if (type !== 'message' || typeof fn !== 'function') return add.call(this, type, fn, opts);
    let g = wrapped.get(fn);
    if (!g) {
      g = function (this: Window, e: Event) {
        if (F.dropReady && isReady((e as MessageEvent).data as Msg)) return;
        return fn.call(this, e);
      };
      wrapped.set(fn, g);
    }
    return add.call(this, type, g, opts);
  } as Window['addEventListener'];
  window.removeEventListener = function (this: Window, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) {
    return remove.call(this, type, (type === 'message' && wrapped.get(fn)) || fn, opts);
  } as Window['removeEventListener'];

  // 全屏与方向锁定
  const denied = (what: string) => Promise.reject(new DOMException(`注入的${what}拒绝`, 'NotAllowedError'));
  const requestFullscreen = Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen = function (this: Element, opts?: FullscreenOptions) {
    w.__fsCalls.push({ kind: 'fullscreen', target: this.tagName.toLowerCase(), arg: JSON.stringify(opts ?? null),
      active: !!navigator.userActivation?.isActive, at: Date.now() });
    if (F.fullscreen === 'reject') return denied('全屏');
    return requestFullscreen.call(this, opts);
  };
  type Lockable = { lock?: (o: string) => Promise<void> };
  const proto = (typeof ScreenOrientation === 'function' ? ScreenOrientation.prototype : null) as Lockable | null;
  const lock = proto?.lock;
  if (proto && lock) proto.lock = function (this: ScreenOrientation, o: string) {
    w.__fsCalls.push({ kind: 'lock', target: 'screen', arg: String(o), active: !!navigator.userActivation?.isActive, at: Date.now() });
    if (F.lock === 'reject') return denied('方向锁定');
    return lock.call(this, o);
  };
}

export async function installFaults(target: Page | BrowserContext, init: Partial<FaultSwitches> = {}) {
  await target.addInitScript(install, init);
}

export const setFaults = (page: Page, s: Partial<FaultSwitches>) =>
  page.evaluate(s => { Object.assign((window as unknown as Hooks).__faults, s); }, s);

export const fsCalls = (page: Page) => page.evaluate(() => (window as unknown as Hooks).__fsCalls);
export const messages = (page: Page) => page.evaluate(() => (window as unknown as Hooks).__msgs);
