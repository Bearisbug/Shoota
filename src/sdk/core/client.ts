// SDK v2 游戏端（API-SDK-001～003）：载入后发 hello，等平台回 welcome 拿到存档与游戏区环境，画出首帧后由游戏调 ready()。
// 不依赖 React，也不直接碰 DOM：收发消息经 Transport，网页里用 window.ts 的 windowTransport，
// 以后放到没有 DOM 的环境（如微信小游戏）换一个 Transport 即可。
// 1 秒内收不到 welcome（或根本不在平台的 iframe 里）判定为「不在平台里打开」：不读写存档，由界面层提示从 shoota.ai 打开。

import { PLAY } from '../../shared/limits';
import {
  isSdkMessage, SDK_NS, SDK_VERSION,
  type GameToPlatform, type Orientation, type PlayEnv, type PlayGame, type PlayUser, type RunEnv,
} from '../../shared/protocol';
import type { AchievementDef } from '../../shared/save';
import type { SdkShell, ShellOrientation, ShellPrefs } from './protocolExt';
import { GameStorage, type StorageOp } from './storage';

export type OutMessage = GameToPlatform | SdkShell;

export interface Transport {
  /** 是否在平台页面的 iframe 里；false 时直接判定为不在平台里打开 */
  readonly embedded: boolean;
  send(msg: OutMessage): void;
  /** 只交出平台发来的消息：来源窗口与 origin 由 Transport 核对 */
  listen(fn: (data: unknown) => void): () => void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export type ClientState = 'connecting' | 'connected' | 'orphan';
export type SuspendReason = 'exit' | 'hidden';

export interface ClientOptions {
  game: string; // 目录里的游戏标识，和平台的 welcome 对不上就不认
  build?: string;
  transport: Transport;
  timers?: Timers;
}

export interface ShootaClient {
  readonly gameId: string;
  readonly state: ClientState;
  readonly game: PlayGame | null;
  readonly user: PlayUser | null;
  /** 游戏区的实时环境；连上之前为 null */
  readonly env: PlayEnv | null;
  readonly storage: GameStorage;
  /** 顶部信息区各方向的展开状态，GameShell 用 */
  readonly shell: ShellPrefs;
  /** welcome 到了就 resolve；判定为不在平台里打开时 reject（OrphanError） */
  connected(): Promise<void>;
  /** state、env、shell 变化时回调 */
  subscribe(fn: () => void): () => void;
  /** 画出第一帧可操作的画面后调一次，平台据此关掉载入页 */
  ready(): void;
  /** 就绪前出错时调，平台到 15 秒时把失败原因记为游戏报错；连上之前的第一条先记下，welcome 到了补发；就绪后调用不发 */
  reportError(message: string): void;
  unlock(key: string): void;
  defineAchievements(list: AchievementDef[]): void;
  setStatus(text: string): void;
  /** 运行中改偏好方向（如进入横屏比赛），平台按它重新锁定方向或提示旋转 */
  setOrientation(prefer: Orientation): void;
  setShellExpanded(orientation: ShellOrientation, expanded: boolean): void;
  exit(): void;
  /** 平台退出或页面隐藏前回调，游戏在这里把手里没存的进度存掉；平台最多等 0.5 秒 */
  onSuspend(fn: (reason: SuspendReason) => void | Promise<void>): () => void;
  destroy(): void;
}

export class OrphanError extends Error {
  constructor() {
    super('不在 shoota 平台里打开');
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const RUNS: readonly RunEnv[] = ['browser', 'wechat', 'standalone'];

export function parseEnv(v: unknown): PlayEnv | null {
  if (!isObj(v) || !isObj(v.safe)) return null;
  const s = v.safe;
  if (v.orientation !== 'portrait' && v.orientation !== 'landscape') return null;
  if (typeof v.fullscreen !== 'boolean' || typeof v.reducedMotion !== 'boolean') return null;
  if (!isNum(v.width) || !isNum(v.height) || !RUNS.includes(v.run as RunEnv)) return null;
  if (!isNum(s.top) || !isNum(s.right) || !isNum(s.bottom) || !isNum(s.left)) return null;
  return {
    orientation: v.orientation, fullscreen: v.fullscreen, width: v.width, height: v.height,
    safe: { top: s.top, right: s.right, bottom: s.bottom, left: s.left }, run: v.run as RunEnv, reducedMotion: v.reducedMotion,
  };
}

function parseShell(v: unknown): ShellPrefs {
  const out: ShellPrefs = {};
  if (!isObj(v)) return out;
  if (v.portrait === true) out.portrait = true;
  if (v.landscape === true) out.landscape = true;
  return out;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createClient({ game: gameId, build, transport, timers = defaultTimers }: ClientOptions): ShootaClient {
  const env = (type: string) => ({ ns: SDK_NS, sdk: SDK_VERSION, type }) as const;
  let state: ClientState = 'connecting';
  let game: PlayGame | null = null;
  let user: PlayUser | null = null;
  let playEnv: PlayEnv | null = null;
  let shell: ShellPrefs = {};
  let readied = false;
  let errored = false;
  let pendingError: string | null = null; // 连上之前出的第一条错误，welcome 到了补发
  let timer: unknown;
  const unlocked = new Set<string>();
  const listeners = new Set<() => void>();
  const suspenders = new Set<(reason: SuspendReason) => void | Promise<void>>();
  let resolveConnected!: () => void;
  let rejectConnected!: (e: Error) => void;
  const connectedP = new Promise<void>((res, rej) => {
    resolveConnected = res;
    rejectConnected = rej;
  });
  connectedP.catch(() => {}); // 没人等的时候不报未处理

  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  // 连上之后才发；不在平台里打开时什么都不发，也就什么都存不进去
  const send = (msg: OutMessage) => {
    if (state === 'connected') transport.send(msg);
  };
  const storage = new GameStorage((op: StorageOp) => send({ ...env('storage'), ...op } as OutMessage));

  const orphan = () => {
    if (state !== 'connecting') return;
    state = 'orphan';
    rejectConnected(new OrphanError());
    notify();
  };

  const onSuspend = async (reason: SuspendReason) => {
    await Promise.allSettled([...suspenders].map(fn => Promise.resolve().then(() => fn(reason))));
    send(env('suspended') as OutMessage);
  };

  const receive = (data: unknown) => {
    if (!isSdkMessage(data)) return;
    const m = data as unknown as Record<string, unknown>;
    if (m.type === 'welcome') {
      const g = m.game, u = m.user, e = parseEnv(m.env);
      if (!isObj(g) || g.id !== gameId || !isStr(g.title) || !isObj(u) || !isStr(u.id) || !isStr(u.nickname) || !isObj(m.storage) || !e) return;
      if (state === 'connected') return; // 平台每个 hello 只回一次
      timers.clearTimeout(timer);
      game = { id: gameId, title: g.title };
      user = { id: u.id, nickname: u.nickname };
      playEnv = e;
      shell = parseShell(m.shell);
      storage.load(m.storage as Record<string, string>);
      state = 'connected'; // 1 秒后才到的 welcome 照样接上，界面从提示换回游戏
      if (pendingError !== null) {
        errored = true;
        send({ ...env('error'), message: pendingError } as OutMessage);
        pendingError = null;
      }
      resolveConnected();
      notify();
      return;
    }
    if (state !== 'connected') return;
    if (m.type === 'env') {
      const e = parseEnv(m.env);
      if (!e) return;
      playEnv = e;
      notify();
    } else if (m.type === 'suspend') {
      if (m.reason === 'exit' || m.reason === 'hidden') void onSuspend(m.reason);
    }
  };

  const off = transport.listen(receive);
  if (transport.embedded) {
    timer = timers.setTimeout(orphan, PLAY.welcomeWaitMs);
    transport.send({ ...env('hello'), game: gameId, ...(build ? { build } : {}) } as OutMessage);
  } else {
    state = 'orphan';
    rejectConnected(new OrphanError());
  }

  return {
    gameId,
    get state() { return state; },
    get game() { return game; },
    get user() { return user; },
    get env() { return playEnv; },
    get shell() { return shell; },
    storage,
    connected: () => connectedP,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    ready() {
      if (readied || state !== 'connected') return;
      readied = true;
      send(env('ready') as OutMessage);
    },
    reportError(message) {
      if (readied || errored) return;
      const text = String(message).slice(0, 200);
      if (state !== 'connected') {
        pendingError ??= text;
        return;
      }
      errored = true;
      send({ ...env('error'), message: text } as OutMessage);
    },
    unlock(key) {
      const k = String(key);
      if (unlocked.has(k) || state !== 'connected') return;
      unlocked.add(k);
      send({ ...env('unlock'), key: k } as OutMessage);
    },
    defineAchievements(list) {
      send({ ...env('defs'), list: list.map(a => ({ key: String(a.key), name: String(a.name ?? a.key) })) } as OutMessage);
    },
    setStatus(text) {
      send({ ...env('status'), text: String(text).slice(0, PLAY.statusMaxChars) } as OutMessage);
    },
    setOrientation(prefer) {
      send({ ...env('orientation'), prefer } as OutMessage);
    },
    setShellExpanded(orientation, expanded) {
      if (!!shell[orientation] === expanded) return;
      shell = { ...shell };
      if (expanded) shell[orientation] = true;
      else delete shell[orientation];
      send({ ...env('shell'), orientation, expanded } as OutMessage);
      notify();
    },
    exit() {
      send(env('exit') as OutMessage);
    },
    onSuspend(fn) {
      suspenders.add(fn);
      return () => {
        suspenders.delete(fn);
      };
    },
    destroy() {
      timers.clearTimeout(timer);
      off();
      listeners.clear();
      suspenders.clear();
    },
  };
}
