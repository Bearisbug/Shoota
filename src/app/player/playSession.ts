// 游玩中的存档、计时与统计，两种运行层共用（FLOW-PLAY）。行为沿用旧版 public/index.html（dd731d6）：
// 改动后 700 毫秒合并写一次本机存档，内容没变就不写、提示不变；只计页面在前台的时长，满 2 分钟上报；
// 成就、进度文字、成就定义的截断规则不变。
// 页面隐藏时立刻写存档（§15 本机存档写入）。时长按时钟实际流逝记账、每 5 秒结算一次，
// 不能按回调次数累加：游戏卡住主线程时计时器会少触发。

import { PLAY } from '../../shared/limits';
import type { GameSave } from '../../shared/save';
import type { PlayerPorts } from './ports';

export type SaveStatus =
  | { kind: 'pending' } // 存档待写入
  | { kind: 'reading' } // 读取存档…
  | { kind: 'loaded' } // 已读取存档
  | { kind: 'new' } // 新存档
  | { kind: 'saved'; at: number }; // 已存档 HH:MM

export type StorageOp = { op: 'set'; key: string; value: string } | { op: 'del'; key: string } | { op: 'clear' };

export interface PlaySessionDeps {
  ports: PlayerPorts;
  hidden: () => boolean;
  now?: () => number; // 墙上时间，写进统计的 last 与成就解锁时间
  mono?: () => number; // 单调时钟，算前台时长
  onChange: () => void;
}

// 两次结算之间最多记这么久：设备休眠却没报页面隐藏时，不把休眠时间算成游玩
const MAX_GAP_MS = 30_000;

export class PlaySession {
  save: GameSave;
  status: SaveStatus;
  statusText: string;
  secs = 0; // 本次游玩秒数
  savedAt = 0; // 最近一次真正写入的时间，悬浮按钮据此亮小点
  private json: string;
  private unsent = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private lastAt: number | null = null; // 上次结算的时刻，页面在后台时为 null
  private carryMs = 0; // 不满一秒的零头
  private lastWrite: Promise<void> = Promise.resolve();
  private now: () => number;
  private mono: () => number;

  constructor(readonly gid: string, save: GameSave, private deps: PlaySessionDeps) {
    this.save = save;
    this.json = JSON.stringify(save);
    this.status = Object.keys(save).length ? { kind: 'loaded' } : { kind: 'new' };
    this.now = deps.now ?? Date.now;
    this.mono = deps.mono ?? (() => performance.now());
    this.statusText = deps.ports.stat(gid).status || '';
  }

  storage(m: StorageOp) {
    if (m.op === 'set') this.save[m.key] = m.value;
    else if (m.op === 'del') delete this.save[m.key];
    else this.save = {};
    this.dirty();
  }

  setStatus(text: string) {
    const s = this.deps.ports.stat(this.gid);
    s.status = text.slice(0, PLAY.statusMaxChars);
    this.statusText = s.status;
    this.deps.ports.persist();
    this.deps.onChange();
  }

  defs(list: unknown[]) {
    const clean = list.slice(0, PLAY.achDefsMax)
      .filter((a): a is { key: unknown; name?: unknown } => !!a && typeof a === 'object' && !!(a as { key?: unknown }).key)
      .map(a => ({ key: String(a.key).slice(0, PLAY.achKeyMaxChars), name: String(a.name || a.key).slice(0, PLAY.achNameMaxChars) }));
    this.deps.ports.setAchDefs(this.gid, clean);
    this.deps.ports.persist();
  }

  // 返回新解锁成就的显示名；已解锁过返回 null
  unlock(key: string): string | null {
    const s = this.deps.ports.stat(this.gid);
    const k = key.slice(0, PLAY.achKeyMaxChars);
    if (s.ach[k]) return null;
    s.ach[k] = this.now();
    this.deps.ports.persist();
    return this.deps.ports.achName(this.gid, k) ?? k;
  }

  // 游戏就绪后开始计时
  startClock() {
    if (this.ticker) return;
    this.lastAt = this.deps.hidden() ? null : this.mono();
    this.ticker = setInterval(() => this.settle(), PLAY.tickMs);
  }

  // 结算前台时长：每 5 秒一次，页面切前后台时各一次
  settle() {
    if (!this.ticker) return;
    const t = this.mono();
    if (this.lastAt !== null) this.carryMs += Math.min(MAX_GAP_MS, Math.max(0, t - this.lastAt));
    this.lastAt = this.deps.hidden() ? null : t;
    const whole = Math.floor(this.carryMs / 1000);
    if (!whole) return;
    this.carryMs -= whole * 1000;
    const before = this.secs;
    this.secs += whole;
    const s = this.deps.ports.stat(this.gid);
    s.seconds = (s.seconds || 0) + whole;
    s.last = this.now();
    this.unsent += whole;
    if (this.unsent >= PLAY.playReportSec) this.reportPlay();
    if (Math.floor(this.secs / 30) > Math.floor(before / 30)) this.deps.ports.persist();
    this.deps.onChange();
  }

  reportPlay() {
    if (!this.unsent) return;
    this.deps.ports.track({ t: 'play', g: this.gid, s: this.unsent });
    this.unsent = 0;
  }

  private dirty() {
    if (!this.saveTimer) this.saveTimer = setTimeout(() => this.flush(), PLAY.saveDebounceMs);
  }

  // 立刻写：内容和上次写入（或读出）相同就不写，提示也不改。返回的 promise 在这次写完时完成
  flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const json = JSON.stringify(this.save);
    if (json === this.json) return this.lastWrite;
    this.json = json;
    this.lastWrite = this.deps.ports.writeSave(this.gid, { ...this.save }).then(() => {}, () => {});
    this.savedAt = this.now();
    this.status = { kind: 'saved', at: this.savedAt };
    this.deps.onChange();
    return this.lastWrite;
  }

  // 退出游戏：报时长、写存档、停计时、存元数据；返回的 promise 在存档写完时完成
  close(): Promise<void> {
    this.settle();
    this.reportPlay();
    const written = this.flush();
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.deps.ports.persist();
    return written;
  }
}

export const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
