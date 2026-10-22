// 启动各段计时用的时钟：页面切到后台时暂停，回到前台接着计（§15 启动各段超时的计法）。
// 单测里换成假时钟，可以手动切前后台。

type TimerId = ReturnType<typeof setTimeout>;

export interface Clock {
  now(): number; // 单调毫秒
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId | undefined): void;
  hidden(): boolean;
  onVisibilityChange(fn: () => void): () => void;
}

export const browserClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
  hidden: () => typeof document !== 'undefined' && document.hidden,
  onVisibilityChange(fn) {
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  },
};

// 一段只在前台走的倒计时。restart() 把剩余时间重置成整段（下载中途每收到一块数据重置停滞计时）
export class SegmentTimer {
  private remaining: number;
  private startedAt = 0;
  private id: TimerId | undefined;
  private off: (() => void) | null = null;

  constructor(private clock: Clock, private ms: number, private onFire: () => void) {
    this.remaining = ms;
  }

  start() {
    if (this.off) return;
    this.off = this.clock.onVisibilityChange(() => (this.clock.hidden() ? this.pause() : this.run()));
    if (!this.clock.hidden()) this.run();
  }

  restart() {
    if (!this.off) return;
    this.pause();
    this.remaining = this.ms;
    if (!this.clock.hidden()) this.run();
  }

  stop() {
    this.pause();
    this.off?.();
    this.off = null;
  }

  private run() {
    if (this.id !== undefined) return;
    this.startedAt = this.clock.now();
    this.id = this.clock.setTimeout(() => {
      this.id = undefined;
      this.stop();
      this.onFire();
    }, Math.max(0, this.remaining));
  }

  private pause() {
    if (this.id === undefined) return;
    this.clock.clearTimeout(this.id);
    this.id = undefined;
    this.remaining -= this.clock.now() - this.startedAt;
  }
}

// 用一次就扔的定时器包装：给 promise 加一段前台超时
export function withTimeout<T>(clock: Clock, ms: number, p: Promise<T>, onTimeout: () => void): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = new SegmentTimer(clock, ms, () => {
      onTimeout();
      resolve(TIMED_OUT);
    });
    timer.start();
    p.then(
      v => {
        timer.stop();
        resolve(v);
      },
      e => {
        timer.stop();
        reject(e);
      },
    );
  });
}

export const TIMED_OUT: unique symbol = Symbol('timed-out');
