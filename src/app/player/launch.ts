// 一次启动（FLOW-LAUNCH，ENT-LaunchSession）：下载游戏文件与读本机存档两路并行，各段有超时，
// 失败只自动重做失败的那一路且每次启动最多一次，之后进失败页；装进页面后 15 秒内等就绪信号。
// 状态只经 launchMachine.transition 改，迁移表外的事件一律忽略。每次开始上报一条 start，
// 之后 ready、fail、cancel 恰好一条（API-LAUNCH-001）。

import type { GameEntry } from '../../catalog';
import { LAUNCH } from '../../shared/limits';
import type { RunEnv, Runtime } from '../../shared/protocol';
import type { GameSave } from '../../shared/save';
import type { FullscreenResult, LaunchEvent, LaunchFailReason } from '../../shared/telemetry';
import { CACHE_HIT_HEADER } from '../../sw/constants';
import { SegmentTimer, TIMED_OUT, withTimeout, type Clock } from './clock';
import { INITIAL, onLegFailure, transition, type MachineInput, type MachineState } from './launchMachine';
import type { SaveRead } from './ports';

export class LegError extends Error {
  constructor(readonly reason: LaunchFailReason) {
    super(reason);
  }
}

export interface FetchGameOptions {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  clock: Clock;
  online: () => boolean;
  signal: AbortSignal;
  onProgress?: (bytes: number) => void;
}

export interface FetchedGame {
  text: string;
  cached: boolean;
}

// 下一份游戏文件：首字节 15 秒、中途停滞 10 秒各自超时（只在前台计时），404 与其他非 2xx 分开报
export async function fetchGame(url: string, o: FetchGameOptions): Promise<FetchedGame> {
  const ctrl = new AbortController();
  let timedOut: LaunchFailReason | null = null;
  const stop = (reason: LaunchFailReason) => {
    timedOut = reason;
    ctrl.abort();
  };
  const onOuterAbort = () => ctrl.abort();
  o.signal.addEventListener('abort', onOuterAbort);
  const first = new SegmentTimer(o.clock, LAUNCH.firstByteMs, () => stop('net-timeout'));
  const stall = new SegmentTimer(o.clock, LAUNCH.stallMs, () => stop('net-stall'));
  const netReason = (): LaunchFailReason => timedOut ?? (o.online() ? 'net-error' : 'offline');
  try {
    first.start();
    let res: Response;
    try {
      res = await o.fetch(url, { signal: ctrl.signal, credentials: 'same-origin' });
    } catch {
      throw new LegError(netReason());
    } finally {
      first.stop();
    }
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      throw new LegError(res.status === 404 ? 'http-404' : 'http-error');
    }
    stall.start();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          bytes += value.byteLength;
          stall.restart();
          o.onProgress?.(bytes);
        }
      } else {
        const buf = new Uint8Array(await res.arrayBuffer());
        chunks.push(buf);
        bytes = buf.byteLength;
        o.onProgress?.(bytes);
      }
    } catch {
      throw new LegError(netReason());
    }
    const all = new Uint8Array(bytes);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    return { text: new TextDecoder().decode(all), cached: fromCache(url, res) };
  } finally {
    first.stop();
    stall.stop();
    o.signal.removeEventListener('abort', onOuterAbort);
  }
}

// Service Worker 命中缓存时加 x-shoota-cache: 1；没有 Service Worker 时看资源计时，传输 0 字节即来自 HTTP 缓存
function fromCache(url: string, res: Response): boolean {
  if (res.headers.get(CACHE_HIT_HEADER) === '1') return true;
  try {
    const list = performance.getEntriesByName(new URL(url, location.href).href) as PerformanceResourceTiming[];
    const e = list[list.length - 1];
    return !!e && e.transferSize === 0 && e.decodedBodySize > 0;
  } catch {
    return false;
  }
}

export interface LaunchDeps {
  clock: Clock;
  fetch: FetchGameOptions['fetch'];
  online: () => boolean;
  readSave: (gid: string) => Promise<SaveRead>;
  report: (ev: LaunchEvent) => void;
  run: RunEnv;
  urls: string[]; // 依次尝试的下载地址；带摘要的 404 时换下一个
}

export interface LaunchListener {
  (prev: MachineState, next: MachineState, session: LaunchSession): void;
}

type Leg = 'download' | 'save';

export class LaunchSession {
  state: MachineState = INITIAL;
  progress: number | undefined; // 0～1；改写游戏没有登记大小，显示不定进度
  retrying = false; // 自动重试过，载入页显示「网络不太稳，正在重试…」
  html: string | null = null; // 旧游戏的 HTML；改写游戏只预热缓存，不留正文
  save: GameSave | null = null;
  cached = false;
  fullscreen: FullscreenResult = 0;

  private startAt = 0;
  private terminalSent = true;
  private bootError = false;
  private gen = { download: 0, save: 0 };
  private done = { download: false, save: false };
  private urlIndex = 0;
  private abort: AbortController | null = null;
  private total: SegmentTimer | null = null;
  private readyTimer: SegmentTimer | null = null;
  private listeners = new Set<LaunchListener>();

  constructor(readonly entry: Pick<GameEntry, 'id' | 'size'>, readonly runtime: Runtime, private deps: LaunchDeps) {}

  get gid() {
    return this.entry.id;
  }

  get status() {
    return this.state.status;
  }

  subscribe(fn: LaunchListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /* ── 玩家与运行层触发的事件 ── */

  // 点开始游戏（[*] → loading）
  begin() {
    this.dispatch({ type: 'start' });
  }

  // 失败页点重试（failed → loading）
  retry() {
    this.dispatch({ type: 'retry' });
  }

  // 载入中玩家退出（loading / mounting → cancelled）
  cancel() {
    this.dispatch({ type: 'cancel' });
  }

  // 失败页点退出，或游玩中退出游戏（failed / ready → closed）
  exit() {
    this.dispatch({ type: 'exit' });
  }

  // 收到就绪信号（mounting → ready）；运行层只转发当前 iframe 的消息
  markReady(fromCurrentFrame = true) {
    this.dispatch({ type: 'ready', fromCurrentFrame });
  }

  noteBootError() {
    if (this.state.status === 'mounting') this.bootError = true;
  }

  /* ── 状态机 ── */

  private dispatch(input: MachineInput): boolean {
    const prev = this.state;
    const next = transition(prev, input);
    if (!next) return false;
    this.state = next;
    this.effects(prev, next, input);
    for (const fn of this.listeners) fn(prev, next, this);
    return true;
  }

  private effects(prev: MachineState, next: MachineState, input: MachineInput) {
    const from = prev.status;
    const to = next.status;
    if (input.type === 'start' || input.type === 'retry') return this.enterLoading();
    if (input.type === 'auto-retry') {
      this.retrying = true;
      return;
    }
    if (from === 'loading') this.stopLoading();
    if (from === 'mounting') this.readyTimer?.stop();
    if (to === 'mounting') {
      this.bootError = false;
      this.readyTimer = new SegmentTimer(this.deps.clock, LAUNCH.readyMs, () =>
        this.dispatch({ type: 'ready-timeout', elapsedMs: LAUNCH.readyMs, bootError: this.bootError }));
      this.readyTimer.start();
      return;
    }
    if (to === 'ready') return this.terminal({ p: 'ready', n: next.n, c: this.cached ? 1 : 0, fs: this.fullscreen });
    if (to === 'failed') return this.terminal({ p: 'fail', why: next.reason, n: next.n });
    if (to === 'cancelled') return this.terminal({ p: 'cancel' });
  }

  private event(p: LaunchEvent['p'], extra: Partial<LaunchEvent> = {}): LaunchEvent {
    const ev: LaunchEvent = { p, g: this.gid, r: this.runtime, e: this.deps.run, ...extra };
    if (p !== 'start') ev.ms = this.deps.clock.now() - this.startAt;
    return ev;
  }

  private terminal(extra: Partial<LaunchEvent> & { p: LaunchEvent['p'] }) {
    if (this.terminalSent) return;
    this.terminalSent = true;
    const { p, ...rest } = extra;
    this.deps.report(this.event(p, rest));
  }

  private enterLoading() {
    this.startAt = this.deps.clock.now();
    this.terminalSent = false;
    this.retrying = false;
    this.html = null;
    this.save = null;
    this.cached = false;
    this.progress = this.runtime === 'legacy' ? 0 : undefined;
    this.done = { download: false, save: false };
    this.deps.report(this.event('start'));
    this.total = new SegmentTimer(this.deps.clock, LAUNCH.totalMs, () => this.legFailed('download', 'net-slow'));
    this.total.start();
    this.runLeg('download');
    this.runLeg('save');
  }

  private stopLoading() {
    this.gen.download++;
    this.gen.save++;
    this.abort?.abort();
    this.abort = null;
    this.total?.stop();
  }

  private runLeg(leg: Leg) {
    const gen = ++this.gen[leg];
    if (leg === 'download') void this.download(gen);
    else void this.readSave(gen);
  }

  private legFailed(leg: Leg, reason: LaunchFailReason) {
    if (this.state.status !== 'loading') return;
    const input = onLegFailure(this.state, reason);
    if (leg === 'download') {
      this.gen.download++;
      this.abort?.abort();
    }
    if (!this.dispatch(input)) return;
    if (input.type === 'auto-retry') this.runLeg(leg);
  }

  private legDone(leg: Leg) {
    this.done[leg] = true;
    if (leg === 'download') this.total?.stop();
    if (this.done.download && this.done.save) this.dispatch({ type: 'loaded' });
  }

  private async download(gen: number) {
    const urls = this.deps.urls;
    const ctrl = new AbortController();
    this.abort = ctrl;
    for (;;) {
      const url = urls[Math.min(this.urlIndex, urls.length - 1)];
      try {
        const got = await fetchGame(url, {
          fetch: this.deps.fetch,
          clock: this.deps.clock,
          online: this.deps.online,
          signal: ctrl.signal,
          onProgress: bytes => {
            if (gen !== this.gen.download || this.runtime !== 'legacy') return;
            this.progress = this.entry.size > 0 ? Math.min(1, bytes / this.entry.size) : undefined;
            for (const fn of this.listeners) fn(this.state, this.state, this);
          },
        });
        if (gen !== this.gen.download) return;
        this.html = this.runtime === 'legacy' ? got.text : null;
        this.cached = got.cached;
        if (this.runtime === 'legacy') this.progress = 1;
        return this.legDone('download');
      } catch (e) {
        if (gen !== this.gen.download) return;
        const reason = e instanceof LegError ? e.reason : 'net-error';
        // 带摘要的地址找不到（发布时开着旧页面）：换固定地址再下一次，不算自动重试
        if (reason === 'http-404' && this.urlIndex < urls.length - 1) {
          this.urlIndex++;
          continue;
        }
        return this.legFailed('download', reason);
      }
    }
  }

  // 打开存档库与读出各 4 秒由存档层自己计（LAUNCH.idbOpenMs、idbReadMs）；这里再兜一道两段之和，
  // 存档层的回调本身丢了也不会停在载入中
  private async readSave(gen: number) {
    const backstop = LAUNCH.idbOpenMs + LAUNCH.idbReadMs;
    let reason: LaunchFailReason = 'save-error';
    try {
      const got = await withTimeout(this.deps.clock, backstop, this.deps.readSave(this.gid), () => {});
      if (gen !== this.gen.save) return;
      if (got === TIMED_OUT) reason = 'save-timeout';
      else if (got.ok) {
        this.save = got.save && typeof got.save === 'object' ? got.save : {};
        return this.legDone('save');
      } else reason = got.why;
    } catch {
      if (gen !== this.gen.save) return;
    }
    this.legFailed('save', reason);
  }

  // 页面被关掉（不进往返缓存）时，载入中的这次记为取消
  abandon() {
    if (this.state.status === 'loading' || this.state.status === 'mounting') this.cancel();
  }
}
