// 游戏页的控制器：一个标签页同时只有一次启动，不随 React 组件挂载卸载重开（FLOW-LAUNCH S1「同一款不重开」）。
// 组件经 acquire 拿到这一款，卸载时 release 推迟到下一轮事件循环再退出，开发模式下的重复挂载不会重下文件。
// iframe 放在控制器自己挂到 body 下的宿主 .pl-host（样式见 host.css）里，不跟着游戏页卸载：浏览器后退或返回手势时
// 游戏页先没了，宿主藏起来，改写后的游戏照样收到 suspend，存完档（最多 0.5 秒）才移除 iframe（API-SDK-001）。
// 职责：建 LaunchSession 并跟着它的迁移装卸运行层；就绪后开 PlaySession 计时存档；全屏与方向锁定；页面隐藏与关闭时的收尾。

import type { GameEntry } from '../../catalog';
import type { Orientation, PlayEnv } from '../../shared/protocol';
import type { LaunchFailReason } from '../../shared/telemetry';
import { browserClock } from './clock';
import { runtimeEnv } from './env';
import { enterFullscreen, exitFullscreen, isFullscreen, lockOrientation, onFullscreenChange, toResult } from './fullscreen';
import { legacyUrls, playUrl } from './gameFiles';
import { LaunchSession } from './launch';
import type { LaunchStatus, MachineState } from './launchMachine';
import { mountLegacy } from './legacyRunner';
import { PlaySession, type SaveStatus } from './playSession';
import { mountPlay } from './playRunner';
import { getPorts } from './ports';
import type { Runner, RunnerHandlers } from './runner';
import { browserReporter, type LaunchReporter } from './telemetry';
import { saveShellPref, shellPrefs } from './uiPrefs';
import './host.css';

export interface PlayerView {
  gid: string | null;
  status: LaunchStatus;
  progress: number | undefined;
  retrying: boolean;
  reason: LaunchFailReason | undefined;
  save: SaveStatus;
  statusText: string;
  secs: number;
  savedAt: number;
  prefer: Orientation;
  locked: boolean; // 已按偏好锁定方向
  fullscreen: boolean;
}

export interface PlayerUi {
  achievement(gameTitle: string, name: string): void;
  fullscreenDenied(): void;
}

const EMPTY: PlayerView = {
  gid: null, status: 'idle', progress: undefined, retrying: false, reason: undefined,
  save: { kind: 'pending' }, statusText: '', secs: 0, savedAt: 0, prefer: 'any', locked: false, fullscreen: false,
};

// 开始游戏那次点击里发起的全屏，就绪上报带上它的结果
interface PendingFullscreen { gid: string; ok: boolean; locked: boolean; settled: boolean }

export class PlayerController {
  private view: PlayerView = EMPTY;
  private listeners = new Set<() => void>();
  private entry: GameEntry | null = null;
  private launch: LaunchSession | null = null;
  private runner: Runner | null = null;
  private play: PlaySession | null = null;
  private stage: HTMLElement | null = null; // 游戏页里的占位，挂着表示游戏页在
  private host: HTMLElement | null = null;
  private held = false; // 游戏页拿着这一款，卸载后的那一轮里置回
  private env: PlayEnv | null = null;
  private prefer: Orientation = 'any';
  private locked = false;
  private onExit: (() => void) | null = null;
  private ui: PlayerUi | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private exiting = false;
  private pendingFs: PendingFullscreen | null = null;
  private reporter: LaunchReporter | null = null;
  private wired = false;

  getSnapshot = () => this.view;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  // 开始游戏的那次点击里同步调用（services.beforeLaunch）：安卓手机全屏并锁方向（ADR-008）
  prepare(entry: GameEntry) {
    if (runtimeEnv().fullscreen !== 'auto') return;
    const fs: PendingFullscreen = { gid: entry.id, ok: false, locked: false, settled: false };
    this.pendingFs = fs;
    void enterFullscreen(entry.orientation).then(o => {
      fs.ok = o.ok;
      fs.locked = o.locked;
      fs.settled = true;
      if (this.entry?.id === fs.gid) {
        this.locked = o.locked;
        this.syncFullscreenResult();
        this.emit();
      }
    });
  }

  // 游戏页挂载时调；返回的函数在卸载时调
  acquire(entry: GameEntry, onExit: () => void): () => void {
    this.wire();
    this.onExit = onExit;
    this.held = true;
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    const cur = this.launch;
    if (!(this.entry?.id === entry.id && cur && cur.status !== 'cancelled' && cur.status !== 'closed')) {
      if (cur) this.shutdown();
      this.start(entry);
    }
    return () => {
      if (this.releaseTimer) clearTimeout(this.releaseTimer);
      this.releaseTimer = setTimeout(() => {
        this.releaseTimer = null;
        this.held = false;
        // 面板里的退出正在收尾时由它退；收尾期间游戏页又挂上了这一款就接着玩
        if (this.entry?.id === entry.id && !this.exiting) void this.leave(() => this.held);
      }, 0);
    };
  }

  setUi(ui: PlayerUi | null) {
    this.ui = ui;
  }

  attachStage(el: HTMLElement | null) {
    this.stage = el;
    if (this.host) this.host.hidden = !el;
    if (el && this.launch?.status === 'mounting' && !this.runner) this.mount();
  }

  // 游戏区环境变了：存下来给 welcome，并通知改写后的游戏（API-SDK-003）
  setEnv(env: PlayEnv) {
    this.env = env;
    this.runner?.sendEnv(env);
  }

  retry() {
    this.launch?.retry();
  }

  // 面板、载入页、失败页里的退出，以及游戏自己调退出：改写游戏先收尾（最多 0.5 秒），再回详情页
  async exit() {
    if (this.exiting) return;
    this.exiting = true;
    try {
      await this.leave();
    } finally {
      this.exiting = false;
    }
    this.onExit?.();
  }

  // 面板里的全屏按钮：必须在点击回调里同步调用
  toggleFullscreen() {
    if (isFullscreen()) {
      void exitFullscreen();
      return;
    }
    void enterFullscreen(this.prefer).then(o => {
      if (!o.ok) this.ui?.fullscreenDenied();
      this.locked = o.locked;
      this.emit();
    });
  }

  /* ── 内部 ── */

  // 游玩中先请改写游戏收尾，再退出这一款；等的时候已经换了一款，或 stay 为真，就不退
  private async leave(stay = () => false) {
    const launch = this.launch;
    if (launch?.status === 'ready' && this.runner) await this.runner.suspend('exit');
    if (this.launch === launch && !stay()) this.shutdown();
  }

  private start(entry: GameEntry) {
    const ports = getPorts();
    const env = runtimeEnv();
    this.entry = entry;
    this.prefer = entry.orientation;
    const fs = this.pendingFs?.gid === entry.id ? this.pendingFs : null;
    this.locked = !!fs?.locked;
    // 点开始游戏时就记下最近游玩，开局上报在载入之前（启动失败也算开局，API-001）
    const st = ports.stat(entry.id);
    st.last = Date.now();
    ports.persist();
    void navigator.storage?.persist?.().catch(() => false);
    ports.track({ t: 'start', g: entry.id });
    ports.hold(entry.id);
    const launch = new LaunchSession(entry, entry.runtime, {
      clock: browserClock,
      fetch: (url, init) => fetch(url, init),
      online: () => navigator.onLine !== false,
      readSave: gid => ports.readSave(gid),
      report: ev => this.reporter?.send(ev),
      run: env.run,
      urls: entry.runtime === 'play' ? [playUrl(entry.id)] : legacyUrls(entry),
    });
    this.launch = launch;
    launch.subscribe((prev, next) => this.onTransition(prev, next));
    this.syncFullscreenResult();
    launch.begin();
  }

  private syncFullscreenResult() {
    const fs = this.pendingFs;
    if (!this.launch || !fs || fs.gid !== this.launch.gid) return;
    this.launch.fullscreen = toResult(true, fs.settled ? fs.ok : isFullscreen());
  }

  private onTransition(prev: MachineState, next: MachineState) {
    if (next.status === 'mounting' && prev.status !== 'mounting') this.mount();
    if (prev.status === 'mounting' && (next.status === 'failed' || next.status === 'cancelled')) this.unmount();
    if (next.status === 'ready' && prev.status !== 'ready') {
      this.play?.startClock();
      if (this.env) this.runner?.sendEnv(this.env);
    }
    this.emit();
  }

  private handlers(): RunnerHandlers {
    return {
      storage: m => this.play?.storage(m),
      status: text => this.play?.setStatus(text),
      defs: list => this.play?.defs(list),
      unlock: key => {
        const name = this.play?.unlock(key);
        if (name && this.entry) this.ui?.achievement(this.entry.title, name);
      },
      exit: () => void this.exit(),
      ready: () => {
        this.syncFullscreenResult();
        this.launch?.markReady(true);
      },
      bootError: () => this.launch?.noteBootError(),
      orientation: prefer => this.setPrefer(prefer),
      shell: (orientation, expanded) => {
        if (this.entry) saveShellPref(this.entry.id, orientation, expanded);
      },
    };
  }

  // 下载与读档都完成：在宿主里建 iframe。旧游戏注入 BOOT 写进 srcdoc，改写游戏打开同源页等 hello
  private mount() {
    const launch = this.launch;
    const entry = this.entry;
    if (!launch || !entry || !this.stage || this.runner || launch.save === null) return;
    const ports = getPorts();
    const play = new PlaySession(entry.id, { ...launch.save }, {
      ports,
      hidden: () => document.hidden,
      onChange: () => this.emit(),
    });
    this.play = play;
    const game = { id: entry.id, title: entry.title };
    const user = ports.user();
    if (!this.host) {
      this.host = document.createElement('div');
      this.host.className = 'pl-host';
      document.body.appendChild(this.host);
    }
    this.host.hidden = false;
    this.runner = entry.runtime === 'play'
      ? mountPlay(this.host, {
        game, user, save: () => play.save, env: () => this.env ?? fallbackEnv(), shell: () => shellPrefs(entry.id), handlers: this.handlers(),
      })
      : mountLegacy(this.host, { title: entry.title, html: launch.html ?? '', init: { game, user, storage: play.save }, handlers: this.handlers() });
  }

  // 就绪前失败或取消：移除 iframe；游戏已经写过的存档照常落盘
  private unmount() {
    this.play?.close();
    this.play = null;
    this.runner?.destroy();
    this.runner = null;
  }

  // 退出这一款：载入中记取消，游玩中退出游戏（立刻写存档、报时长、退出全屏、同步一次云存档）
  private shutdown() {
    const launch = this.launch;
    const entry = this.entry;
    if (!launch || !entry) return;
    const wasReady = launch.status === 'ready';
    if (launch.status === 'loading' || launch.status === 'mounting') launch.cancel();
    else if (launch.status === 'ready' || launch.status === 'failed') launch.exit();
    const play = this.play;
    this.play = null;
    const written = play?.close() ?? Promise.resolve();
    this.runner?.destroy();
    this.runner = null;
    this.launch = null;
    this.entry = null;
    this.locked = false;
    if (this.pendingFs?.gid === entry.id) this.pendingFs = null;
    void exitFullscreen();
    const ports = getPorts();
    ports.release(entry.id);
    if (wasReady) void written.then(() => ports.requestSync());
    this.emit();
  }

  private setPrefer(prefer: Orientation) {
    if (prefer === this.prefer) return;
    this.prefer = prefer;
    if (isFullscreen()) {
      void lockOrientation(prefer).then(ok => {
        this.locked = ok;
        this.emit();
      });
    } else this.locked = false;
    this.emit();
  }

  private emit() {
    const l = this.launch;
    const p = this.play;
    this.view = {
      gid: this.entry?.id ?? null,
      status: l?.status ?? 'idle',
      progress: l?.progress,
      retrying: l?.retrying ?? false,
      reason: l?.state.reason,
      save: p?.status ?? (l && (l.status === 'loading') ? { kind: 'reading' } : { kind: 'pending' }),
      statusText: p?.statusText ?? '',
      secs: p?.secs ?? 0,
      savedAt: p?.savedAt ?? 0,
      prefer: this.prefer,
      locked: this.locked,
      fullscreen: isFullscreen(),
    };
    for (const fn of this.listeners) fn();
  }

  // 页面级监听只装一次：切后台立刻写存档并补发遥测，关页面时收尾
  private wire() {
    if (this.wired) return;
    this.wired = true;
    this.reporter = browserReporter();
    document.addEventListener('visibilitychange', () => {
      const play = this.play;
      if (document.hidden) this.reporter?.flushBeacon();
      if (!play) return;
      play.settle();
      if (!document.hidden) return;
      play.reportPlay();
      // 先把手里的写下去（后台随时可能被冻结），改写游戏收尾后再写一次它补发的改动，然后同步云存档
      const first = play.flush();
      const runner = this.launch?.status === 'ready' ? this.runner : null;
      const done = runner ? runner.suspend('hidden').then(() => play.flush()) : first;
      void done.then(() => getPorts().requestSync());
    });
    window.addEventListener('pagehide', e => {
      if (!e.persisted) this.launch?.abandon();
      if (this.play) {
        this.play.reportPlay();
        this.play.flush();
        getPorts().persist();
      }
      this.reporter?.flushBeacon();
    });
    // 进全屏都经 enterFullscreen，锁方向在那里做；这里再锁一次会让一次开局请求两次锁定
    onFullscreenChange(() => {
      if (!isFullscreen()) this.locked = false;
      this.emit();
    });
  }
}

const fallbackEnv = (): PlayEnv => ({
  orientation: innerWidth > innerHeight ? 'landscape' : 'portrait',
  fullscreen: isFullscreen(),
  width: innerWidth,
  height: innerHeight,
  safe: { top: 0, right: 0, bottom: 0, left: 0 },
  run: runtimeEnv().run,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});

export const player = new PlayerController();

// services.beforeLaunch 接这个
export const prepareLaunch = (entry: GameEntry) => player.prepare(entry);
