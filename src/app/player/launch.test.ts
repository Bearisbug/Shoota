// 一次启动（FLOW-LAUNCH）：各段超时、自动重试一次、失败原因、启动上报恰好一条终态。
// 用假时钟与假下载复现 2026-10-22 的三种卡住：下载挂起、存档库不回调、下载中途停滞。
import { describe, expect, it } from 'vitest';
import { LAUNCH } from '../../shared/limits';
import type { LaunchEvent } from '../../shared/telemetry';
import { LaunchSession } from './launch';
import type { SaveRead } from './ports';
import { FakeClock } from './testing/fakeClock';
import { fakeFetch, type FetchMode } from './testing/fakeNet';

const BODY = '<!doctype html><title>斗罗</title>' + 'x'.repeat(4000);
const SIZE = new TextEncoder().encode(BODY).length;
const URLS = ['/g/douluo-0a1b2c3d', '/games/douluo'];

interface Setup {
  modes?: (n: number, url: string) => FetchMode;
  read?: (n: number) => Promise<SaveRead>;
  online?: boolean;
  runtime?: 'legacy' | 'play';
  urls?: string[];
  trickleEveryMs?: number;
}

function setup(o: Setup = {}) {
  const clock = new FakeClock();
  const pushes: (() => void)[] = [];
  const net = fakeFetch(BODY, o.modes ?? (() => 'ok'), { onPull: push => pushes.push(push) });
  if (o.trickleEveryMs) {
    const tick = () => {
      for (const p of pushes) p();
      clock.setTimeout(tick, o.trickleEveryMs!);
    };
    clock.setTimeout(tick, o.trickleEveryMs);
  }
  const events: LaunchEvent[] = [];
  let reads = 0;
  const s = new LaunchSession({ id: 'douluo', size: SIZE }, o.runtime ?? 'legacy', {
    clock,
    fetch: net.fetch,
    online: () => o.online ?? true,
    readSave: () => (o.read ?? (() => Promise.resolve<SaveRead>({ ok: true, save: { k: 'v' } })))(++reads),
    report: ev => events.push(ev),
    run: 'browser',
    urls: o.urls ?? URLS,
  });
  return { clock, net, events, s, reads: () => reads };
}

const never = () => new Promise<SaveRead>(() => {});

describe('正常启动', () => {
  it('下载与读档都完成后进 mounting，收到就绪进 ready；上报 start 与 ready 各一条', async () => {
    const { clock, s, events, net } = setup();
    s.begin();
    expect(s.status).toBe('loading');
    expect(s.progress).toBe(0);
    await clock.advance(0);
    expect(s.status).toBe('mounting');
    expect(s.html).toBe(BODY);
    expect(s.save).toEqual({ k: 'v' });
    expect(s.progress).toBe(1);
    expect(net.calls).toEqual(['/g/douluo-0a1b2c3d']);
    await clock.advance(1200);
    s.markReady();
    expect(s.status).toBe('ready');
    expect(events).toEqual([
      { p: 'start', g: 'douluo', r: 'legacy', e: 'browser' },
      { p: 'ready', g: 'douluo', r: 'legacy', e: 'browser', ms: 1200, n: 1, c: 0, fs: 0 },
    ]);
  });

  it('没有存档时用空存档开局', async () => {
    const { clock, s } = setup({ read: () => Promise.resolve({ ok: true, save: undefined }) });
    s.begin();
    await clock.advance(0);
    expect(s.save).toEqual({});
  });

  it('改写后的游戏只预热页面，不留正文，进度不定', async () => {
    const { clock, s, net } = setup({ runtime: 'play', urls: ['/play/douluo/'] });
    s.begin();
    expect(s.progress).toBeUndefined();
    await clock.advance(0);
    expect(s.status).toBe('mounting');
    expect(s.html).toBeNull();
    expect(net.calls).toEqual(['/play/douluo/']);
  });

  it('启动上报只带游戏、运行层、打开环境与耗时，没有旅客编号与云存档编号（INV-CLOUD-002）', async () => {
    const { clock, s, events } = setup({ modes: () => 'hang' });
    s.begin();
    await clock.advance(40_000);
    const allowed = new Set(['p', 'g', 'r', 'e', 'ms', 'why', 'n', 'c', 'fs']);
    for (const ev of events) for (const k of Object.keys(ev)) expect(allowed.has(k), k).toBe(true);
  });
});

describe('下载挂起：15 秒没有首字节', () => {
  it('第一次挂起：15 秒后自动重下一次，成功后开局，ready 的 n 为 2', async () => {
    const { clock, s, events, net } = setup({ modes: n => (n === 1 ? 'hang' : 'ok') });
    s.begin();
    await clock.advance(LAUNCH.firstByteMs - 1);
    expect(s.status).toBe('loading');
    expect(s.retrying).toBe(false);
    await clock.advance(1);
    expect(s.retrying).toBe(true);
    expect(net.calls).toHaveLength(2);
    expect(net.aborted).toBeGreaterThanOrEqual(1);
    expect(s.status).toBe('mounting');
    s.markReady();
    expect(events.map(e => [e.p, e.n])).toEqual([['start', undefined], ['ready', 2]]);
  });

  it('两次都挂起：30 秒进失败页，原因 net-timeout，只上报一条 fail', async () => {
    const { clock, s, events } = setup({ modes: () => 'hang' });
    s.begin();
    await clock.advance(2 * LAUNCH.firstByteMs);
    expect(s.status).toBe('failed');
    expect(s.state.reason).toBe('net-timeout');
    expect(events).toEqual([
      { p: 'start', g: 'douluo', r: 'legacy', e: 'browser' },
      { p: 'fail', g: 'douluo', r: 'legacy', e: 'browser', ms: 30_000, why: 'net-timeout', n: 2 },
    ]);
    await clock.advance(120_000);
    expect(events).toHaveLength(2);
  });
});

describe('下载中途停滞：10 秒没有新字节', () => {
  it('第一次停在一半：10 秒后自动重下，进度停在一半时显示重试', async () => {
    const { clock, s } = setup({ modes: n => (n === 1 ? 'stall' : 'ok') });
    s.begin();
    await clock.advance(0);
    expect(s.progress).toBeCloseTo(0.5, 1);
    await clock.advance(LAUNCH.stallMs - 1);
    expect(s.retrying).toBe(false);
    await clock.advance(1);
    expect(s.retrying).toBe(true);
    expect(s.status).toBe('mounting');
  });

  it('两次都停住：20 秒进失败页，原因 net-stall', async () => {
    const { clock, s, events } = setup({ modes: () => 'stall' });
    s.begin();
    await clock.advance(2 * LAUNCH.stallMs);
    expect(s.status).toBe('failed');
    expect(events.at(-1)).toMatchObject({ p: 'fail', why: 'net-stall', n: 2, ms: 20_000 });
  });

  it('一直在收字节但两分钟没下完：net-slow，不自动重试', async () => {
    const { clock, s, events } = setup({ modes: () => 'trickle', trickleEveryMs: 5_000 });
    s.begin();
    await clock.advance(LAUNCH.totalMs - 1);
    expect(s.status).toBe('loading');
    await clock.advance(1);
    expect(s.status).toBe('failed');
    expect(s.retrying).toBe(false);
    expect(events.at(-1)).toMatchObject({ p: 'fail', why: 'net-slow', n: 1, ms: 120_000 });
  });
});

describe('本机存档库读不出来（RULE-LAUNCH-001）', () => {
  it('存档库一直不回调：打开与读出两段之后重开一次，仍不行进失败页，不开局', async () => {
    const { clock, s, events, reads } = setup({ read: never });
    s.begin();
    const backstop = LAUNCH.idbOpenMs + LAUNCH.idbReadMs;
    await clock.advance(backstop - 1);
    expect(s.status).toBe('loading');
    expect(reads()).toBe(1);
    await clock.advance(1);
    expect(reads()).toBe(2);
    expect(s.retrying).toBe(true);
    await clock.advance(backstop);
    expect(s.status).toBe('failed');
    expect(s.state.reason).toBe('save-timeout');
    expect(s.save).toBeNull(); // 没有可开局的存档，运行层不会建 iframe
    expect(events.at(-1)).toMatchObject({ p: 'fail', why: 'save-timeout', n: 2 });
  });

  it('存档层报超时或报错都只重试一次', async () => {
    const a = setup({ read: n => Promise.resolve(n === 1 ? { ok: false, why: 'save-timeout' } : { ok: true, save: undefined }) });
    a.s.begin();
    await a.clock.advance(0);
    expect(a.s.status).toBe('mounting');
    expect(a.reads()).toBe(2);

    const b = setup({ read: () => Promise.resolve({ ok: false, why: 'save-error' }) });
    b.s.begin();
    await b.clock.advance(0);
    expect(b.s.status).toBe('failed');
    expect(b.s.state.reason).toBe('save-error');
    expect(b.reads()).toBe(2);
  });

  it('只重做失败的那一路：读档重试不会重新下载', async () => {
    const { clock, s, net } = setup({ read: n => Promise.resolve(n === 1 ? { ok: false, why: 'save-error' } : { ok: true, save: {} }) });
    s.begin();
    await clock.advance(0);
    expect(s.status).toBe('mounting');
    expect(net.calls).toHaveLength(1);
  });
});

describe('三种卡住都在 120 秒内结束（REQ-LAUNCH-001、REQ-LAUNCH-002、M3）', () => {
  const cases: [string, Setup][] = [
    ['下载挂起', { modes: () => 'hang' }],
    ['下载挂起一次', { modes: n => (n === 1 ? 'hang' : 'ok') }],
    ['存档库不回调', { read: never }],
    ['下载中途停滞', { modes: () => 'stall' }],
    ['下载中途停滞一次', { modes: n => (n === 1 ? 'stall' : 'ok') }],
  ];
  for (const [name, o] of cases) {
    it(name, async () => {
      const { clock, s, events } = setup(o);
      // 游戏一装进页面就报就绪，只看平台这一侧会不会停在载入中
      s.subscribe((_, next) => {
        if (next.status === 'mounting') queueMicrotask(() => s.markReady());
      });
      s.begin();
      await clock.advance(120_000);
      expect(['ready', 'failed']).toContain(s.status);
      expect(events.filter(e => e.p !== 'start')).toHaveLength(1);
    });
  }
});

describe('其他失败', () => {
  it('离线：直接进失败页，不等超时、不重试', async () => {
    const { clock, s, net, events } = setup({ modes: () => 'offline', online: false });
    s.begin();
    await clock.advance(0);
    expect(s.status).toBe('failed');
    expect(s.state.reason).toBe('offline');
    expect(net.calls).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ p: 'fail', why: 'offline', n: 1, ms: 0 });
  });

  it('在线时请求出错记 net-error 并重试一次', async () => {
    const { clock, s, net } = setup({ modes: n => (n === 1 ? 'offline' : 'ok') });
    s.begin();
    await clock.advance(0);
    expect(net.calls).toHaveLength(2);
    expect(s.status).toBe('mounting');
  });

  it('带摘要的地址 404：改用固定地址再下一次，不算自动重试', async () => {
    const { clock, s, net, events } = setup({ modes: (_, url) => (url.startsWith('/g/') ? 404 : 'ok') });
    s.begin();
    await clock.advance(0);
    expect(net.calls).toEqual(URLS);
    expect(s.status).toBe('mounting');
    expect(s.retrying).toBe(false);
    s.markReady();
    expect(events.at(-1)).toMatchObject({ p: 'ready', n: 1 });
  });

  it('固定地址也 404：失败页 http-404，不自动重试', async () => {
    const { clock, s, net } = setup({ modes: () => 404 });
    s.begin();
    await clock.advance(0);
    expect(net.calls).toEqual(URLS);
    expect(s.state).toMatchObject({ status: 'failed', reason: 'http-404', n: 1 });
  });

  it('服务器出错：重试一次，仍不行记 http-error', async () => {
    const { clock, s, net } = setup({ modes: () => 500 });
    s.begin();
    await clock.advance(0);
    expect(net.calls).toHaveLength(2);
    expect(s.state).toMatchObject({ status: 'failed', reason: 'http-error', n: 2 });
  });
});

describe('就绪（mounting）', () => {
  it('15 秒没有就绪信号：boot-timeout，不自动重试，只下载一次', async () => {
    const { clock, s, net, events } = setup();
    s.begin();
    await clock.advance(0);
    await clock.advance(LAUNCH.readyMs - 1);
    expect(s.status).toBe('mounting');
    await clock.advance(1);
    expect(s.state).toMatchObject({ status: 'failed', reason: 'boot-timeout' });
    expect(s.retrying).toBe(false);
    expect(net.calls).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ p: 'fail', why: 'boot-timeout', n: 1, ms: LAUNCH.readyMs });
  });

  it('就绪前游戏报过错：到 15 秒记 boot-error', async () => {
    const { clock, s } = setup();
    s.begin();
    await clock.advance(0);
    s.noteBootError();
    await clock.advance(LAUNCH.readyMs);
    expect(s.state.reason).toBe('boot-error');
  });

  it('报错后又就绪：照常开局', async () => {
    const { clock, s } = setup();
    s.begin();
    await clock.advance(0);
    s.noteBootError();
    s.markReady();
    expect(s.status).toBe('ready');
    await clock.advance(LAUNCH.readyMs);
    expect(s.status).toBe('ready');
  });

  it('不是当前 iframe 发来的就绪不算', async () => {
    const { clock, s } = setup();
    s.begin();
    await clock.advance(0);
    s.markReady(false);
    expect(s.status).toBe('mounting');
  });
});

describe('页面在后台时暂停计时（§15）', () => {
  it('首字节计时只算前台时间', async () => {
    const { clock, s } = setup({ modes: () => 'hang' });
    s.begin();
    await clock.advance(5_000);
    clock.setHidden(true);
    await clock.advance(60_000);
    expect(s.retrying).toBe(false);
    clock.setHidden(false);
    await clock.advance(LAUNCH.firstByteMs - 5_000 - 1);
    expect(s.retrying).toBe(false);
    await clock.advance(1);
    expect(s.retrying).toBe(true);
  });

  it('就绪计时只算前台时间', async () => {
    const { clock, s } = setup();
    s.begin();
    await clock.advance(0);
    clock.setHidden(true);
    await clock.advance(60_000);
    expect(s.status).toBe('mounting');
    clock.setHidden(false);
    await clock.advance(LAUNCH.readyMs);
    expect(s.status).toBe('failed');
  });
});

describe('退出与重试', () => {
  it('载入中退出：中止下载，上报 cancel 带耗时', async () => {
    const { clock, s, net, events } = setup({ modes: () => 'hang' });
    s.begin();
    await clock.advance(3_000);
    s.cancel();
    expect(s.status).toBe('cancelled');
    await clock.advance(0);
    expect(net.aborted).toBe(1);
    expect(events.at(-1)).toEqual({ p: 'cancel', g: 'douluo', r: 'legacy', e: 'browser', ms: 3_000 });
    await clock.advance(120_000);
    expect(events).toHaveLength(2);
    expect(clock.pending).toBe(0);
  });

  it('装进页面后、就绪前退出：上报 cancel', async () => {
    const { clock, s, events } = setup();
    s.begin();
    await clock.advance(500);
    s.cancel();
    expect(events.at(-1)).toMatchObject({ p: 'cancel', ms: 500 });
  });

  it('失败页点重试：算一次新的开始，n 回到 1', async () => {
    const { clock, s, events } = setup({ modes: n => (n <= 2 ? 'hang' : 'ok') });
    s.begin();
    await clock.advance(30_000);
    expect(s.status).toBe('failed');
    s.retry();
    expect(s.status).toBe('loading');
    expect(s.retrying).toBe(false);
    await clock.advance(0);
    s.markReady();
    expect(events.map(e => e.p)).toEqual(['start', 'fail', 'start', 'ready']);
    expect(events[3]).toMatchObject({ n: 1, ms: 0 });
  });

  it('每次开始之后 ready、fail、cancel 恰好一条：就绪后退出、失败后退出都不再上报', async () => {
    const a = setup();
    a.s.begin();
    await a.clock.advance(0);
    a.s.markReady();
    a.s.exit();
    a.s.cancel();
    expect(a.s.status).toBe('closed');
    expect(a.events.map(e => e.p)).toEqual(['start', 'ready']);

    const b = setup({ modes: () => 404 });
    b.s.begin();
    await b.clock.advance(0);
    b.s.exit();
    b.s.markReady();
    expect(b.s.status).toBe('closed');
    expect(b.events.map(e => e.p)).toEqual(['start', 'fail']);
  });

  it('关页面时载入中的这次记为取消', async () => {
    const { clock, s, events } = setup({ modes: () => 'hang' });
    s.begin();
    await clock.advance(1_000);
    s.abandon();
    expect(events.at(-1)).toMatchObject({ p: 'cancel' });
  });
});
