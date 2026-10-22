// 旧运行层（API-SDK-004、REQ-022）：注入脚本逐字沿用旧版，window.Platform 1.0、假 localStorage、
// 每次为空的 sessionStorage 逐条对齐 docs/DESIGN.md §41；iframe 的 sandbox 与 allow 等于共享常量。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_ALLOW, LEGACY_SANDBOX, type LegacyInit, type LegacyMessage } from '../../shared/protocol';
import { BOOT, BOOT_SIGNALS, inject, LEGACY_BOOT } from './boot';
import { mountLegacy, routeLegacyMessage } from './legacyRunner';
import type { RunnerHandlers } from './runner';

// dd731d6 public/index.html 里 BOOT 模板字符串的 SHA-256 与长度
const OLD_BOOT_SHA256 = 'a4d86d5cbd60ace584c574f033123acbc81721e0f89ccd586753b3c97b07ad65';
const OLD_BOOT_LENGTH = 1782;

const INIT: LegacyInit = {
  game: { id: 'basketball-star', title: '篮球巨星' },
  user: { id: 'u9c436708', nickname: '玩家' },
  storage: { 'bs.save': '{"week":3}' },
};

interface FakeWindow {
  localStorage: Storage & Record<string, unknown>;
  sessionStorage: Storage;
  Platform: Record<string, unknown> & {
    version: string; game: unknown; user: unknown;
    unlock(k: unknown): void; defineAchievements(l: unknown): void; setStatus(t: unknown): void; exit(): void;
  };
}

// 在一个假的 window 里跑注入脚本，收集它发给平台的消息
function runBoot(init: LegacyInit = INIT, boot = BOOT) {
  const posted: (LegacyMessage & { __cj: 1 })[] = [];
  const winListeners = new Map<string, ((e: unknown) => void)[]>();
  const docListeners = new Map<string, (() => void)[]>();
  const win: Record<string, unknown> = {
    addEventListener: (t: string, fn: (e: unknown) => void) => winListeners.set(t, [...(winListeners.get(t) ?? []), fn]),
  };
  const parent = { postMessage: (m: LegacyMessage & { __cj: 1 }, target: string) => { expect(target).toBe('*'); posted.push(structuredClone(m)); } };
  const doc = { addEventListener: (t: string, fn: () => void) => docListeners.set(t, [...(docListeners.get(t) ?? []), fn]) };
  new Function('window', 'parent', 'document', 'var I=' + JSON.stringify(init) + ';' + boot)(win, parent, doc);
  const w = win as unknown as FakeWindow;
  return {
    w,
    posted,
    domReady: () => docListeners.get('DOMContentLoaded')?.forEach(fn => fn()),
    fire: (type: string, e: unknown) => winListeners.get(type)?.forEach(fn => fn(e)),
  };
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('注入脚本逐字沿用旧版', () => {
  it('LEGACY_BOOT 与 dd731d6 的 BOOT 逐字相同', async () => {
    expect(LEGACY_BOOT.length).toBe(OLD_BOOT_LENGTH);
    expect(await sha256(LEGACY_BOOT)).toBe(OLD_BOOT_SHA256);
    expect(BOOT).toBe(LEGACY_BOOT + BOOT_SIGNALS);
  });

  it('插在第一个 <head> 之后；没有 head 插在 doctype 之后；都没有放最前；init 里的 < 与 U+2028/2029 转义', () => {
    const init: LegacyInit = { ...INIT, storage: { k: '</script>\u2028\u2029' } };
    const tag = '<script>(function(){var I=' + JSON.stringify(init).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';X})();<\/script>';
    expect(inject('<!doctype html><html><head lang="zh"><title>t</title></head></html>', init, 'X'))
      .toBe('<!doctype html><html><head lang="zh">' + tag + '<title>t</title></head></html>');
    expect(inject('<!DOCTYPE html><p>无 head</p>', init, 'X')).toBe('<!DOCTYPE html>' + tag + '<p>无 head</p>');
    expect(inject('<p>什么都没有</p>', init, 'X')).toBe(tag + '<p>什么都没有</p>');
    expect(tag).toContain('\\u003c/script>\\u2028\\u2029');
  });
});

describe('window.Platform 1.0（§41、API-SDK-004）', () => {
  it('成员与旧版相同，对象被冻结', () => {
    const { w } = runBoot();
    expect(Object.keys(w.Platform)).toEqual(['version', 'game', 'user', 'unlock', 'defineAchievements', 'setStatus', 'exit']);
    expect(w.Platform.version).toBe('1.0');
    expect(w.Platform.game).toEqual(INIT.game);
    expect(w.Platform.user).toEqual(INIT.user);
    expect(Object.isFrozen(w.Platform)).toBe(true);
  });

  it('unlock 转字符串、本次打开内去重；setStatus 截 60 字；defineAchievements 深拷贝；exit', () => {
    const { w, posted } = runBoot();
    w.Platform.unlock(7);
    w.Platform.unlock('7');
    w.Platform.setStatus('第'.repeat(80));
    const defs = [{ key: 'mvp', name: '最有价值球员', extra: () => 1 }];
    w.Platform.defineAchievements(defs);
    w.Platform.defineAchievements(null);
    w.Platform.exit();
    expect(posted).toEqual([
      { type: 'unlock', key: '7', __cj: 1 },
      { type: 'status', text: '第'.repeat(60), __cj: 1 },
      { type: 'defs', list: [{ key: 'mvp', name: '最有价值球员' }], __cj: 1 },
      { type: 'defs', list: [], __cj: 1 },
      { type: 'exit', __cj: 1 },
    ]);
  });
});

describe('假 localStorage', () => {
  it('读写删清、key 与 length 的语义与旧版相同', () => {
    const { w, posted } = runBoot();
    const ls = w.localStorage;
    expect(ls.getItem('bs.save')).toBe('{"week":3}');
    expect(ls.getItem('没有')).toBeNull();
    expect(ls.length).toBe(1);
    ls.setItem(1 as unknown as string, 2 as unknown as string);
    expect(ls.getItem('1')).toBe('2');
    expect(ls.key(1)).toBe('bs.save'); // 键序按对象键序，数字键排在前面，与旧版相同
    expect(ls.key(5)).toBeNull();
    ls.removeItem('没有'); // 不存在的键不发消息
    ls.removeItem('1');
    ls.clear();
    expect(ls.length).toBe(0);
    expect(posted).toEqual([
      { type: 'ls-set', k: '1', v: '2', __cj: 1 },
      { type: 'ls-del', k: '1', __cj: 1 },
      { type: 'ls-clear', __cj: 1 },
    ]);
  });

  it('支持 Proxy 时按属性读写与删除', () => {
    const { w, posted } = runBoot();
    const ls = w.localStorage;
    expect(ls['bs.save']).toBe('{"week":3}');
    ls['level'] = 5;
    expect(ls.getItem('level')).toBe('5');
    delete ls['level'];
    expect(ls.getItem('level')).toBeNull();
    expect(ls['没有']).toBeUndefined();
    expect(posted.map(m => m.type)).toEqual(['ls-set', 'ls-del']);
  });

  it('同一份 init 里的存档表就是游戏读写的表', () => {
    const storage: Record<string, string> = {};
    const { w } = runBoot({ ...INIT, storage });
    w.localStorage.setItem('a', 'b');
    expect(w.localStorage.getItem('a')).toBe('b');
  });
});

describe('sessionStorage 每次打开都是空的', () => {
  it('不带入任何数据，写入不发给平台', () => {
    const a = runBoot();
    expect(a.w.sessionStorage.getItem('bs.save')).toBeNull();
    a.w.sessionStorage.setItem('x', 'y');
    expect(a.w.sessionStorage.getItem('x')).toBe('y');
    expect(a.w.sessionStorage.key(0)).toBe('x');
    a.w.sessionStorage.removeItem('x');
    expect(a.w.sessionStorage.getItem('x')).toBeNull();
    expect(a.posted).toEqual([]);
    const b = runBoot();
    expect(b.w.sessionStorage.getItem('x')).toBeNull();
  });
});

describe('启动信号（游戏看不到）', () => {
  it('页面解析完发 boot-ready', () => {
    const { posted, domReady } = runBoot();
    domReady();
    expect(posted).toEqual([{ type: 'boot-ready', __cj: 1 }]);
  });

  it('就绪前第一个未捕获错误发 boot-error，只发一次，截 200 字；就绪后的错误不发', () => {
    const a = runBoot();
    a.fire('error', { message: 'x'.repeat(300) });
    a.fire('unhandledrejection', { reason: new Error('第二个') });
    expect(a.posted).toEqual([{ type: 'boot-error', message: 'x'.repeat(200), __cj: 1 }]);

    const b = runBoot();
    b.fire('unhandledrejection', { reason: new Error('promise 坏了') });
    expect(b.posted).toEqual([{ type: 'boot-error', message: 'promise 坏了', __cj: 1 }]);

    const c = runBoot();
    c.domReady();
    c.fire('error', { message: '就绪之后' });
    expect(c.posted.map(m => m.type)).toEqual(['boot-ready']);
  });
});

describe('平台侧收消息（§41 平台收消息与截断规则）', () => {
  const handlers = () => ({
    storage: vi.fn(), status: vi.fn(), defs: vi.fn(), unlock: vi.fn(), exit: vi.fn(),
    ready: vi.fn(), bootError: vi.fn(), orientation: vi.fn(), shell: vi.fn(),
  }) satisfies RunnerHandlers;

  it('按类型分发，键值转成字符串', () => {
    const h = handlers();
    routeLegacyMessage({ __cj: 1, type: 'ls-set', k: 3 as unknown as string, v: 4 as unknown as string }, h);
    routeLegacyMessage({ __cj: 1, type: 'ls-del', k: 'a' }, h);
    routeLegacyMessage({ __cj: 1, type: 'ls-clear' }, h);
    routeLegacyMessage({ __cj: 1, type: 'status', text: 5 as unknown as string }, h);
    routeLegacyMessage({ __cj: 1, type: 'defs', list: 'x' as unknown as unknown[] }, h);
    routeLegacyMessage({ __cj: 1, type: 'defs', list: [{ key: 'a' }] }, h);
    routeLegacyMessage({ __cj: 1, type: 'unlock', key: 9 as unknown as string }, h);
    routeLegacyMessage({ __cj: 1, type: 'exit' }, h);
    routeLegacyMessage({ __cj: 1, type: 'boot-ready' }, h);
    routeLegacyMessage({ __cj: 1, type: 'boot-error', message: 'm' }, h);
    expect(h.storage.mock.calls).toEqual([[{ op: 'set', key: '3', value: '4' }], [{ op: 'del', key: 'a' }], [{ op: 'clear' }]]);
    expect(h.status).toHaveBeenCalledWith('5');
    expect(h.defs.mock.calls).toEqual([[[{ key: 'a' }]]]); // 不是数组的 list 丢弃
    expect(h.unlock).toHaveBeenCalledWith('9');
    expect(h.exit).toHaveBeenCalledOnce();
    expect(h.ready).toHaveBeenCalledOnce();
    expect(h.bootError).toHaveBeenCalledWith('m');
  });
});

describe('旧游戏 iframe', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeDom() {
    const listeners = new Set<(e: MessageEvent) => void>();
    const frameWin = {};
    const attrs: Record<string, string> = {};
    const frame = {
      contentWindow: frameWin, srcdoc: '', className: '',
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      remove: vi.fn(),
    };
    vi.stubGlobal('document', { createElement: (tag: string) => { expect(tag).toBe('iframe'); return frame; } });
    vi.stubGlobal('window', {
      addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.delete(fn),
    });
    const stage = { appendChild: vi.fn() } as unknown as HTMLElement;
    const send = (source: unknown, data: unknown) => { for (const fn of listeners) fn({ source, data, origin: 'null' } as MessageEvent); };
    return { frame, frameWin, attrs, stage, send, listeners };
  }

  it('sandbox 与 allow 等于共享常量，不带 allow-same-origin；srcdoc 是注入后的游戏', () => {
    const dom = fakeDom();
    const h = { storage: vi.fn(), status: vi.fn(), defs: vi.fn(), unlock: vi.fn(), exit: vi.fn(), ready: vi.fn(), bootError: vi.fn(), orientation: vi.fn(), shell: vi.fn() };
    const runner = mountLegacy(dom.stage, { title: '篮球巨星', html: '<head></head>', init: INIT, handlers: h });
    expect(dom.attrs).toEqual({ sandbox: LEGACY_SANDBOX, title: '篮球巨星', allow: LEGACY_ALLOW });
    expect(LEGACY_SANDBOX).toBe('allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox');
    expect(LEGACY_ALLOW).toBe('fullscreen; autoplay');
    expect(dom.frame.srcdoc).toBe(inject('<head></head>', INIT));
    expect(dom.stage.appendChild).toHaveBeenCalledWith(dom.frame);

    // 只认当前 iframe 发来的、带 __cj 的消息
    dom.send({}, { __cj: 1, type: 'exit' });
    dom.send(dom.frameWin, { type: 'exit' });
    dom.send(dom.frameWin, { __cj: 1, type: 'boot-ready' });
    expect(h.exit).not.toHaveBeenCalled();
    expect(h.ready).toHaveBeenCalledOnce();

    runner.destroy();
    expect(dom.listeners.size).toBe(0);
    expect(dom.frame.srcdoc).toBe('');
    expect(dom.frame.remove).toHaveBeenCalled();
  });
});
