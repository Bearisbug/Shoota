// SDK v2 平台端（API-SDK-001～003）：和真的 SDK 游戏端对接，核对握手顺序、存档、环境与收尾；
// 以及 mountPlay 只认同源、当前 iframe 的消息。
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createClient, type OutMessage, type Transport } from '../../sdk/core';
import type { PlatformToGame, PlayEnv } from '../../shared/protocol';
import { routeLegacyMessage } from './legacyRunner';
import { mountPlay, parseGameMessage, PlayChannel, type PlayMount } from './playRunner';
import type { RunnerHandlers } from './runner';

const ENV: PlayEnv = {
  orientation: 'portrait', fullscreen: false, width: 393, height: 852,
  safe: { top: 0, right: 0, bottom: 0, left: 0 }, run: 'browser', reducedMotion: false,
};
const W = { ns: 'shoota', sdk: 2 } as const;
const tick = () => new Promise<void>(r => setTimeout(r, 0));

type Handlers = { [K in keyof RunnerHandlers]: Mock<RunnerHandlers[K]> };
const handlers = (): Handlers => ({
  storage: vi.fn(), status: vi.fn(), defs: vi.fn(), unlock: vi.fn(), exit: vi.fn(),
  ready: vi.fn(), bootError: vi.fn(), orientation: vi.fn(), shell: vi.fn(),
});

function mount(h = handlers(), over: Partial<PlayMount> = {}): PlayMount {
  return {
    game: { id: 'yike', title: '一克之差' },
    user: { id: 'u1', nickname: '玩家' },
    save: () => ({ 'yike.save': '{"lv":5}' }),
    env: () => ENV,
    shell: () => ({ landscape: true }),
    handlers: h,
    ...over,
  };
}

// 平台与游戏之间隔一层异步投递，和 postMessage 一样
function pair(m: PlayMount) {
  const log: string[] = [];
  let toGame: ((d: unknown) => void) | null = null;
  const channel = new PlayChannel(m, msg => {
    log.push('→ ' + msg.type);
    setTimeout(() => toGame?.(structuredClone(msg)), 0);
  });
  const transport: Transport = {
    embedded: true,
    send: (msg: OutMessage) => {
      log.push('← ' + msg.type);
      setTimeout(() => channel.receive(structuredClone(msg)), 0);
    },
    listen: fn => {
      toGame = fn;
      return () => { toGame = null; };
    },
  };
  const client = createClient({ game: 'yike', transport });
  return { channel, client, log };
}

describe('与 SDK 游戏端对接', () => {
  it('依次 hello、welcome、ready；游戏拿到存档、环境与展开状态', async () => {
    const h = handlers();
    const { client, log } = pair(mount(h));
    await client.connected();
    expect(client.storage.getItem('yike.save')).toBe('{"lv":5}');
    expect(client.env).toEqual(ENV);
    expect(client.shell).toEqual({ landscape: true });
    client.ready();
    await tick();
    expect(log).toEqual(['← hello', '→ welcome', '← ready']);
    expect(h.ready).toHaveBeenCalledTimes(1);
  });

  it('改动进度：每次改动都交给平台的存档处理，和旧运行层收到的是同一种操作', async () => {
    const h = handlers();
    const { client } = pair(mount(h));
    await client.connected();
    client.storage.setItem('yike.save', '{"lv":6}');
    client.storage.removeItem('yike.save');
    client.storage.clear();
    await tick();
    const legacy = handlers();
    routeLegacyMessage({ __cj: 1, type: 'ls-set', k: 'yike.save', v: '{"lv":6}' }, legacy);
    routeLegacyMessage({ __cj: 1, type: 'ls-del', k: 'yike.save' }, legacy);
    routeLegacyMessage({ __cj: 1, type: 'ls-clear' }, legacy);
    expect(h.storage.mock.calls).toEqual(legacy.storage.mock.calls);
    expect(h.storage.mock.calls).toEqual([
      [{ op: 'set', key: 'yike.save', value: '{"lv":6}' }],
      [{ op: 'del', key: 'yike.save' }],
      [{ op: 'clear' }],
    ]);
  });

  it('方向、全屏或尺寸变了才发 env，游戏端随之更新', async () => {
    const env = { ...ENV };
    const { channel, client, log } = pair(mount(handlers(), { env: () => env }));
    await client.connected();
    channel.sendEnv({ ...ENV });
    const land: PlayEnv = { ...ENV, orientation: 'landscape', width: 852, height: 393 };
    channel.sendEnv(land);
    channel.sendEnv({ ...land, fullscreen: true });
    channel.sendEnv({ ...land, fullscreen: true });
    await tick();
    expect(log.filter(l => l === '→ env')).toHaveLength(2);
    expect(client.env).toEqual({ ...land, fullscreen: true });
  });

  it('退出前 suspend：游戏收尾时写的存档先到，收到 suspended 就结束等待', async () => {
    const h = handlers();
    const { channel, client } = pair(mount(h));
    await client.connected();
    client.onSuspend(() => client.storage.setItem('yike.save', '{"lv":7}'));
    const t0 = performance.now();
    await channel.suspend('exit');
    expect(performance.now() - t0).toBeLessThan(400);
    expect(h.storage).toHaveBeenCalledWith({ op: 'set', key: 'yike.save', value: '{"lv":7}' });
  });

  it('游戏不回 suspended 时最多等 0.5 秒', async () => {
    vi.useFakeTimers();
    try {
      const post = vi.fn();
      const channel = new PlayChannel(mount(), post);
      channel.receive({ ...W, type: 'hello', game: 'yike' });
      let done = false;
      void channel.suspend('hidden').then(() => { done = true; });
      expect(post).toHaveBeenLastCalledWith({ ...W, type: 'suspend', reason: 'hidden' });
      await vi.advanceTimersByTimeAsync(499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('游戏端改展开状态，平台按方向收到', async () => {
    const h = handlers();
    const { client } = pair(mount(h));
    await client.connected();
    client.setShellExpanded('landscape', false);
    await tick();
    expect(h.shell).toHaveBeenCalledWith('landscape', false);
  });
});

describe('PlayChannel 收消息', () => {
  it('握手前的消息、别的游戏的 hello、格式不对的消息都丢掉', () => {
    const h = handlers();
    const posted: PlatformToGame[] = [];
    const channel = new PlayChannel(mount(h), m => { posted.push(m); });
    channel.receive({ ...W, type: 'ready' });
    channel.receive({ ...W, type: 'storage', op: 'set', key: 'a', value: '1' });
    channel.receive({ ...W, type: 'hello', game: 'f1' });
    expect(posted).toEqual([]);
    channel.receive({ ...W, type: 'hello', game: 'yike' });
    expect(posted).toHaveLength(1);
    channel.receive({ ...W, type: 'storage', op: 'set', key: 'a', value: 1 });
    channel.receive({ ...W, type: 'orientation', prefer: 'up' });
    channel.receive({ ...W, type: 'shell', orientation: 'landscape', expanded: 'yes' });
    channel.receive({ ns: 'shoota', sdk: 1, type: 'ready' });
    for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
    channel.receive({ ...W, type: 'ready' });
    channel.receive({ ...W, type: 'ready' });
    expect(h.ready).toHaveBeenCalledTimes(1);
  });

  it('就绪前的 error 记为游戏报错，就绪后的不记', () => {
    const h = handlers();
    const channel = new PlayChannel(mount(h), () => {});
    channel.receive({ ...W, type: 'hello', game: 'yike' });
    channel.receive({ ...W, type: 'error', message: '坏了' });
    channel.receive({ ...W, type: 'ready' });
    channel.receive({ ...W, type: 'error', message: '又坏了' });
    expect(h.bootError.mock.calls).toEqual([['坏了']]);
  });

  it('重复 hello（游戏页重载）照样回 welcome，带最新存档', () => {
    let save = { a: '1' };
    const posted: Array<{ type: string; storage?: unknown }> = [];
    const channel = new PlayChannel(mount(handlers(), { save: () => save }), m => { posted.push(m); });
    channel.receive({ ...W, type: 'hello', game: 'yike' });
    save = { a: '2' };
    channel.receive({ ...W, type: 'hello', game: 'yike' });
    expect(posted.map(p => p.storage)).toEqual([{ a: '1' }, { a: '2' }]);
  });

  it('parseGameMessage 认得全部十一种游戏消息', () => {
    const ok = [
      { type: 'hello', game: 'yike' }, { type: 'ready' }, { type: 'exit' }, { type: 'suspended' },
      { type: 'storage', op: 'clear' }, { type: 'unlock', key: 'k' }, { type: 'defs', list: [] },
      { type: 'status', text: 't' }, { type: 'orientation', prefer: 'any' }, { type: 'error', message: 'm' },
      { type: 'shell', orientation: 'portrait', expanded: true },
    ];
    for (const m of ok) expect(parseGameMessage({ ...W, ...m })).not.toBeNull();
    expect(parseGameMessage({ ...W, type: 'welcome' })).toBeNull();
  });
});

describe('mountPlay', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('同源 iframe 打开 /play/<游戏>/，只认这个 iframe、同源发来的消息', () => {
    const listeners = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('window', {
      addEventListener: (t: string, fn: (e: unknown) => void) => listeners.set(t, fn),
      removeEventListener: (t: string) => listeners.delete(t),
    });
    vi.stubGlobal('location', { origin: 'https://shoota.ai' });
    const contentWindow = { postMessage: vi.fn() };
    const attrs: Record<string, string> = {};
    const frame = {
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      className: '', src: '', contentWindow, remove: vi.fn(),
    };
    vi.stubGlobal('document', { createElement: () => frame });
    const stage = { appendChild: vi.fn() };
    const h = handlers();
    const r = mountPlay(stage as unknown as HTMLElement, mount(h));
    expect(frame.src).toBe('/play/yike/');
    expect(attrs).toEqual({ title: '一克之差', allow: 'fullscreen; autoplay' });
    expect(attrs.sandbox).toBeUndefined();
    const hello = { ...W, type: 'hello', game: 'yike' };
    const on = listeners.get('message')!;
    on({ source: {}, origin: 'https://shoota.ai', data: hello });
    on({ source: contentWindow, origin: 'https://evil.example', data: hello });
    expect(contentWindow.postMessage).not.toHaveBeenCalled();
    on({ source: contentWindow, origin: 'https://shoota.ai', data: hello });
    expect(contentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'welcome' }), 'https://shoota.ai');
    r.destroy();
    expect(listeners.has('message')).toBe(false);
    expect(frame.remove).toHaveBeenCalled();
  });
});
