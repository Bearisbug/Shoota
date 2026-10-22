// SDK v2 游戏端（API-SDK-001～003）：握手、不在平台里打开、存档读写、收尾与环境变化。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayEnv } from '../../shared/protocol';
import { createClient, OrphanError, type OutMessage, type Transport } from './client';

const ENV: PlayEnv = {
  orientation: 'portrait', fullscreen: false, width: 393, height: 852,
  safe: { top: 0, right: 0, bottom: 0, left: 0 }, run: 'browser', reducedMotion: false,
};
const W = { ns: 'shoota', sdk: 2 } as const;
const welcome = (extra: Record<string, unknown> = {}) => ({
  ...W, type: 'welcome', game: { id: 'yike', title: '一克之差' }, user: { id: 'u1', nickname: '玩家' },
  storage: { 'yike.save': '{"lv":5}' }, env: ENV, ...extra,
});

function fakeTransport(embedded = true) {
  const sent: OutMessage[] = [];
  let fn: ((d: unknown) => void) | null = null;
  const transport: Transport = {
    embedded,
    send: m => { sent.push(m); },
    listen: f => {
      fn = f;
      return () => { fn = null; };
    },
  };
  return { transport, sent, deliver: (d: unknown) => fn?.(d), types: () => sent.map(m => m.type) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('握手', () => {
  it('一创建就发 hello，welcome 到了才算连上，存档同步可读', async () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', build: 'b1', transport: t.transport });
    expect(t.sent).toEqual([{ ...W, type: 'hello', game: 'yike', build: 'b1' }]);
    expect(c.state).toBe('connecting');
    expect(() => c.storage.getItem('yike.save')).toThrow(); // 没读到存档前不许读写，免得当成新游戏
    t.deliver(welcome());
    await expect(c.connected()).resolves.toBeUndefined();
    expect(c.state).toBe('connected');
    expect(c.game).toEqual({ id: 'yike', title: '一克之差' });
    expect(c.env).toEqual(ENV);
    expect(c.storage.getItem('yike.save')).toBe('{"lv":5}');
    c.ready();
    c.ready();
    expect(t.types()).toEqual(['hello', 'ready']);
  });

  it('不是这款游戏的 welcome、格式不对的消息、别的协议一律不认', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome({ game: { id: 'f1', title: 'F1' } }));
    t.deliver(welcome({ env: { ...ENV, width: 'wide' } }));
    t.deliver({ __cj: 1, type: 'welcome' });
    t.deliver({ ...welcome(), sdk: 1 });
    expect(c.state).toBe('connecting');
  });

  it('1 秒内没有 welcome 判定为不在平台里打开，什么都不发；之后才到的 welcome 照样接上', async () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    const changes = vi.fn();
    c.subscribe(changes);
    vi.advanceTimersByTime(999);
    expect(c.state).toBe('connecting');
    vi.advanceTimersByTime(1);
    expect(c.state).toBe('orphan');
    await expect(c.connected()).rejects.toBeInstanceOf(OrphanError);
    c.unlock('a');
    c.setStatus('第 5 关');
    expect(t.types()).toEqual(['hello']);
    t.deliver(welcome());
    expect(c.state).toBe('connected');
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('不在 iframe 里直接判定为不在平台里打开，不发 hello', async () => {
    const t = fakeTransport(false);
    const c = createClient({ game: 'yike', transport: t.transport });
    expect(c.state).toBe('orphan');
    expect(t.sent).toEqual([]);
    await expect(c.connected()).rejects.toBeInstanceOf(OrphanError);
  });

  it('就绪前的错误只报第一条并截到 200 字，就绪后不报', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome());
    c.reportError('x'.repeat(300));
    c.reportError('第二条');
    c.ready();
    c.reportError('就绪后');
    const errors = t.sent.filter(m => m.type === 'error') as Array<{ message: string }>;
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toHaveLength(200);
  });

  it('连上之前出的错先记下，welcome 到了补发第一条', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    c.reportError('初始化失败');
    c.reportError('第二条');
    expect(t.types()).toEqual(['hello']);
    t.deliver(welcome());
    c.reportError('连上之后');
    expect(t.sent.filter(m => m.type === 'error')).toEqual([{ ...W, type: 'error', message: '初始化失败' }]);
  });
});

describe('存档', () => {
  it('语义同旧版假 localStorage：转字符串、删不存在的键不发、清空', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome());
    const s = c.storage;
    s.setItem('n', 3 as unknown as string);
    expect(s.getItem('n')).toBe('3');
    expect(s.length).toBe(2);
    expect(s.key(0)).toBe('yike.save');
    s.removeItem('没有');
    s.removeItem('n');
    s.clear();
    expect(s.length).toBe(0);
    expect(t.sent.filter(m => m.type === 'storage')).toEqual([
      { ...W, type: 'storage', op: 'set', key: 'n', value: '3' },
      { ...W, type: 'storage', op: 'del', key: 'n' },
      { ...W, type: 'storage', op: 'clear' },
    ]);
  });

  it('welcome 里不是字符串的值丢掉', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome({ storage: { a: '1', b: 2, c: null } }));
    expect(c.storage.snapshot()).toEqual({ a: '1' });
  });
});

describe('游玩中', () => {
  it('成就同一条只发一次，进度文字截到 60 字，成就定义规整成键与名', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome());
    c.unlock('first');
    c.unlock('first');
    c.setStatus('长'.repeat(80));
    c.defineAchievements([{ key: 'first', name: '第一次' }, { key: 'k2' } as unknown as { key: string; name: string }]);
    c.setOrientation('landscape');
    c.exit();
    expect(t.sent.slice(1)).toEqual([
      { ...W, type: 'unlock', key: 'first' },
      { ...W, type: 'status', text: '长'.repeat(60) },
      { ...W, type: 'defs', list: [{ key: 'first', name: '第一次' }, { key: 'k2', name: 'k2' }] },
      { ...W, type: 'orientation', prefer: 'landscape' },
      { ...W, type: 'exit' },
    ]);
  });

  it('env 消息更新环境并通知，格式不对的丢掉', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome());
    const fn = vi.fn();
    c.subscribe(fn);
    const land = { ...ENV, orientation: 'landscape', width: 852, height: 393 };
    t.deliver({ ...W, type: 'env', env: land });
    t.deliver({ ...W, type: 'env', env: { ...land, run: 'app' } });
    expect(c.env).toEqual(land);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('收到 suspend 先跑完游戏的收尾，再回 suspended；收尾里写的存档排在 suspended 前面', async () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome());
    const reasons: string[] = [];
    c.onSuspend(async reason => {
      reasons.push(reason);
      await Promise.resolve();
      c.storage.setItem('yike.save', '{"lv":6}');
    });
    c.onSuspend(() => { throw new Error('坏的收尾不影响回 suspended'); });
    t.deliver({ ...W, type: 'suspend', reason: 'exit' });
    await vi.waitFor(() => expect(t.types()).toContain('suspended'));
    expect(reasons).toEqual(['exit']);
    expect(t.types().slice(-2)).toEqual(['storage', 'suspended']);
  });

  it('顶部信息区展开状态：welcome 带回、改了才发、只记展开的方向', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    t.deliver(welcome({ shell: { landscape: true, portrait: 'yes' } }));
    expect(c.shell).toEqual({ landscape: true });
    c.setShellExpanded('landscape', true);
    c.setShellExpanded('landscape', false);
    c.setShellExpanded('portrait', true);
    expect(c.shell).toEqual({ portrait: true });
    expect(t.sent.filter(m => m.type === 'shell')).toEqual([
      { ...W, type: 'shell', orientation: 'landscape', expanded: false },
      { ...W, type: 'shell', orientation: 'portrait', expanded: true },
    ]);
  });

  it('destroy 后不再收消息', () => {
    const t = fakeTransport();
    const c = createClient({ game: 'yike', transport: t.transport });
    c.destroy();
    t.deliver(welcome());
    vi.advanceTimersByTime(2000);
    expect(c.state).toBe('connecting');
  });
});
