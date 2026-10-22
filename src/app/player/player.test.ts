// 游戏页控制器（FLOW-LAUNCH S1，REQ-LAUNCH-001「同一款游戏不重开」）：
// 同一款在载入或游玩中再挂载、或卸载后同一轮里又挂上（开发模式重复挂载、连点开始），不重下文件，开始只报一条。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameById } from '../../catalog';
import type { GameEntry } from '../../catalog';
import type { PlayEnv } from '../../shared/protocol';
import type { LaunchEvent } from '../../shared/telemetry';
import { PlayerController } from './player';
import { configurePlayer } from './ports';
import { fakePorts } from './testing/fakePorts';
import { fakeFetch } from './testing/fakeNet';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function stubBrowser() {
  const net = fakeFetch('<html><body>game</body></html>', () => 'ok');
  const launches: LaunchEvent[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/launch') {
      launches.push(...(JSON.parse(init.body as string).ev as LaunchEvent[]));
      return new Response(null, { status: 204 });
    }
    return net.fetch(url, init);
  });
  const listeners = { add: vi.fn(), remove: vi.fn() };
  // 只做到运行层用到的几样：建元素、往 body 和宿主里放、iframe 的 contentWindow
  const frames: Array<{ src: string; contentWindow: { postMessage: ReturnType<typeof vi.fn> }; remove: ReturnType<typeof vi.fn> }> = [];
  const element = () => ({
    className: '', hidden: false, children: [] as unknown[],
    appendChild(el: unknown) { this.children.push(el); return el; },
  });
  const body = element();
  const win = new Map<string, (e: unknown) => void>();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, onLine: true });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('location', { origin: O });
  vi.stubGlobal('document', {
    hidden: false,
    fullscreenEnabled: true,
    fullscreenElement: null,
    documentElement: { requestFullscreen: async () => {} },
    addEventListener: listeners.add,
    removeEventListener: listeners.remove,
    body,
    createElement: (tag: string) => {
      if (tag !== 'iframe') return element();
      const f = { src: '', className: '', setAttribute: () => {}, contentWindow: { postMessage: vi.fn() }, remove: vi.fn() };
      frames.push(f);
      return f;
    },
  });
  vi.stubGlobal('window', {
    addEventListener: (t: string, fn: (e: unknown) => void) => win.set(t, fn),
    removeEventListener: (t: string) => win.delete(t),
  });
  // 当前 iframe 里的游戏发一条消息给平台
  const fromGame = (data: unknown) => win.get('message')?.({ source: frames[frames.length - 1].contentWindow, origin: O, data });
  return { net, launches, frames, body, fromGame };
}

const O = 'https://shoota.ai';
const W = { ns: 'shoota', sdk: 2 } as const;
const ENV: PlayEnv = {
  orientation: 'portrait', fullscreen: false, width: 393, height: 852,
  safe: { top: 0, right: 0, bottom: 0, left: 0 }, run: 'browser', reducedMotion: false,
};

let entry: GameEntry;

beforeEach(() => {
  entry = gameById('yike')!;
  configurePlayer(fakePorts(async () => ({ ok: true, save: { a: '1' } })).ports);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('同一款游戏不重开', () => {
  it('载入中再挂载一次：不重新下载，开始只报一条', async () => {
    const { net, launches } = stubBrowser();
    const c = new PlayerController();
    const onExit = vi.fn();
    const release1 = c.acquire(entry, onExit);
    release1();
    const release2 = c.acquire(entry, onExit); // 同一轮里又挂上：开发模式重复挂载
    c.acquire(entry, onExit); // 载入中又点了一次开始
    await tick();
    await tick();
    expect(net.calls).toHaveLength(1);
    expect(launches.filter(e => e.p === 'start')).toHaveLength(1);
    expect(c.getSnapshot()).toMatchObject({ gid: 'yike', status: 'mounting' });
    release2();
    await tick();
    await tick();
    // 真正卸载：记一次取消，开始与结束各一条
    expect(c.getSnapshot().status).toBe('idle');
    expect(launches.map(e => e.p)).toEqual(['start', 'cancel']);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('换了一款：先结束上一款，再开新的', async () => {
    const { launches } = stubBrowser();
    const c = new PlayerController();
    c.acquire(entry, () => {});
    await tick();
    c.acquire(gameById('f1')!, () => {});
    await tick();
    await tick();
    expect(launches.map(e => `${e.p}:${e.g}`)).toEqual(['start:yike', 'cancel:yike', 'start:f1']);
  });

  it('退出：载入中直接收尾并回详情页', async () => {
    const { launches } = stubBrowser();
    const c = new PlayerController();
    const onExit = vi.fn();
    c.acquire(entry, onExit);
    await c.exit();
    await tick();
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(launches.map(e => e.p)).toEqual(['start', 'cancel']);
  });
});

// 浏览器后退、安卓返回手势：hash 一变游戏页就卸载，iframe 在控制器的宿主里，收完尾才移除（API-SDK-001，FLOW-LAUNCH S6）
describe('游戏页卸载时改写游戏照样收尾', () => {
  async function playing() {
    const b = stubBrowser();
    const fp = fakePorts(async () => ({ ok: true, save: { a: '1' } }));
    configurePlayer(fp.ports);
    const c = new PlayerController();
    const game: GameEntry = { ...entry, runtime: 'play' };
    const stage = {} as HTMLElement;
    const onExit = vi.fn();
    c.setEnv(ENV);
    c.attachStage(stage);
    const release = c.acquire(game, onExit);
    await tick();
    await tick();
    const host = b.body.children[0] as { className: string; hidden: boolean; children: unknown[] };
    const frame = b.frames[0];
    expect(host.className).toBe('pl-host');
    expect(host.children).toEqual([frame]);
    b.fromGame({ ...W, type: 'hello', game: 'yike' });
    b.fromGame({ ...W, type: 'ready' });
    expect(c.getSnapshot().status).toBe('ready');
    return { ...b, fp, c, game, stage, onExit, release, host, frame };
  }

  it('先藏起宿主、发 suspend，游戏存完档回 suspended 才移除 iframe 并写进本机存档', async () => {
    const p = await playing();
    p.c.attachStage(null);
    p.release();
    await tick();
    expect(p.host.hidden).toBe(true);
    expect(p.frame.contentWindow.postMessage).toHaveBeenLastCalledWith({ ...W, type: 'suspend', reason: 'exit' }, O);
    expect(p.frame.remove).not.toHaveBeenCalled();
    p.fromGame({ ...W, type: 'storage', op: 'set', key: 'yike.save', value: '{"lv":6}' });
    p.fromGame({ ...W, type: 'suspended' });
    await tick();
    expect(p.frame.remove).toHaveBeenCalled();
    expect(p.fp.saves.yike).toEqual({ a: '1', 'yike.save': '{"lv":6}' });
    expect(p.c.getSnapshot().status).toBe('idle');
    expect(p.onExit).not.toHaveBeenCalled();
  });

  it('收尾期间又回到这一款的游戏页：接着玩，不重开', async () => {
    const p = await playing();
    p.c.attachStage(null);
    p.release();
    await tick();
    p.c.attachStage(p.stage);
    p.c.acquire(p.game, p.onExit);
    expect(p.host.hidden).toBe(false);
    p.fromGame({ ...W, type: 'suspended' });
    await tick();
    expect(p.frame.remove).not.toHaveBeenCalled();
    expect(p.c.getSnapshot().status).toBe('ready');
    expect(p.net.calls).toHaveLength(1);
  });
});
