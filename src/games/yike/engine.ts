// 玩法与存档，逐段照搬旧版 public/games/yike.html（dd731d6）的「存档」「状态」「交互」「结算」：
// 数值、文案、计时、存档键与格式都不变。不碰 DOM：旧版 render() 换成通知界面重画，特效换成事件交给界面播。
import { coverOf, genLevel, PAN_MAX } from './gen';
import { scaleGeom, SC_X, sumOf } from './model';

export const SKEY = 'yikezhicha.v2';
export const HERBS: [string, string][] = [["当归", "#9b3b2e"], ["甘草", "#a8781f"], ["黄芪", "#8f6d17"], ["枸杞", "#b8402e"], ["陈皮", "#b5601a"], ["红枣", "#86282a"], ["茯苓", "#6e604e"], ["川芎", "#56653a"], ["白芍", "#7c6283"], ["党参", "#68472c"], ["桂枝", "#743c21"], ["薄荷", "#36745a"], ["山楂", "#a8342e"], ["菊花", "#9c8418"], ["百合", "#6c7a5c"], ["莲子", "#4f7366"]];

// 存档：yikezhicha.v2 的 JSON，读的时候把认不出的字段原样留着，写回时一起写
export interface SaveData {
  level: number;
  attempts: Record<number, number>;
  best: Record<number, number>;
  sound: boolean;
  intro: boolean;
  [field: string]: unknown;
}

export interface Tile {
  id: number; w: number; src: 'b' | 'd';
  gx?: number; gy?: number; layer?: number; d?: number; k?: number;
  blind: boolean; seen: boolean; decoy: boolean;
  loc: 'board' | 'pan' | 'hold' | 'gone';
  scale: number; cov: boolean; herb: [string, string];
  goneJ?: number; // 收走时在吊盘里排第几
  shakeN: number; // 每点一次压住的药包加 1，界面据此重播抖动
}
export interface Scale { T: number; items: number[]; retired: boolean; flashN: number }
export interface GameState {
  serial: number; // 每开一局加 1，界面据此整盘重建
  lv: number; tiles: Tile[]; scales: Scale[]; queue: number[]; dr: [number, number]; maxL: number;
  hold: number[]; cap: number; sel: number; props: { undo: number; peek: number; swap: number };
  revive: number; last: { id: number; si: number; from: 'board' | 'hold' } | null; busy: boolean;
  total: number; done: number; prevBest: number; over: boolean; peekUntil: number;
}

// 弹窗内容，结算那一刻算好
export type Modal =
  | { kind: 'intro' }
  | { kind: 'lose'; title: string; line: [string, string, string]; sub: string; done: string; attempts: number; canRevive: boolean }
  | { kind: 'win'; sub: string; total: number; attempts: number; next: number };

// 特效：坐标在旧版逻辑舞台里
export type Fx =
  | { type: 'toast'; text: string }
  | { type: 'float'; x: number; y: number; text: string; bad: boolean }
  | { type: 'burst'; x: number; y: number; n: number };

export interface Sfx { tap(): void; sel(): void; no(): void; near(): void; ding(): void; thud(): void; lose(): void; win(): void; unlock(): void }

export interface GameDeps {
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  sfx: Sfx;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  now?: () => number;
  random?: () => number;
}

export class YikeGame {
  save: SaveData;
  G: GameState | null = null;
  modal: Modal | null = null;
  version = 0;
  private serial = 0;
  private listeners = new Set<() => void>();
  private fxListeners = new Set<(fx: Fx) => void>();
  private later: (fn: () => void, ms: number) => unknown;
  private now: () => number;
  private random: () => number;

  constructor(private deps: GameDeps) {
    this.later = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    /* 存档 */
    let save: SaveData = { level: 1, attempts: {}, best: {}, sound: true, intro: false };
    try { const s = JSON.parse(deps.storage.getItem(SKEY) as string); if (s) save = Object.assign(save, s); } catch { /* 读不出就当新档 */ }
    this.save = save;
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  onFx(fn: (fx: Fx) => void) { this.fxListeners.add(fn); return () => { this.fxListeners.delete(fn); }; }
  get peeking() { return !!this.G && this.now() < this.G.peekUntil; }

  private render() { this.version++; for (const fn of [...this.listeners]) fn(); }
  private fx(e: Fx) { for (const fn of [...this.fxListeners]) fn(e); }
  private persist() { try { this.deps.storage.setItem(SKEY, JSON.stringify(this.save)); } catch { /* 写不进也接着玩 */ } }
  private toast(text: string) { this.fx({ type: 'toast', text }); }
  private floatText(x: number, y: number, text: string, bad = false) { this.fx({ type: 'float', x, y, text, bad }); }
  private burst(x: number, y: number, n = 14) { this.fx({ type: 'burst', x, y, n }); }

  start() {
    const lv = this.save.level || 1;
    this.startLevel(lv);
    if (!this.save.intro) this.intro();
  }

  /* 状态 */
  startLevel(lv: number) {
    const save = this.save;
    save.level = lv; save.attempts[lv] = (save.attempts[lv] || 0) + 1; this.persist();
    const L = genLevel(lv);
    const tiles: Tile[] = L.tiles.map((t, i) => ({ id: i, w: t.w, src: t.src, gx: t.gx, gy: t.gy, layer: t.layer, d: t.d, k: t.k, blind: !!t.blind, seen: !t.blind, decoy: !!t.decoy, loc: 'board', scale: -1, cov: false, herb: HERBS[(i * 7 + t.w * 3) % HERBS.length], shakeN: 0 }));
    const queue = L.targets.slice();
    const scales: Scale[] = [0, 1, 2].map(() => { const T = queue.shift(); return { T: T ?? 0, items: [], retired: T === undefined, flashN: 0 }; });
    this.G = { serial: ++this.serial, lv, tiles, scales, queue, dr: L.dr, maxL: Math.max(0, ...tiles.filter(t => t.src === 'b').map(t => t.layer!)), hold: [], cap: L.cap, sel: 0, props: { undo: 1, peek: 1, swap: 1 }, revive: 1, last: null, busy: false, total: L.targets.length, done: 0, prevBest: save.best[lv] || 0, over: false, peekUntil: 0 };
    coverOf(this.G.tiles); this.modal = null; this.render();
  }

  /* 交互 */
  private activeSel() { const G = this.G!; if (!G.scales[G.sel].retired) return G.sel; const i = G.scales.findIndex(s => !s.retired); if (i >= 0) G.sel = i; return i; }
  selectScale(i: number) { const G = this.G!; if (G.over || G.scales[i].retired) return; G.sel = i; this.deps.sfx.sel(); this.render(); }
  tapTile(id: number) {
    const G = this.G!, t = G.tiles[id];
    if (G.busy || G.over) return;
    if (t.loc === 'board' && t.cov) { this.deps.sfx.no(); t.shakeN++; this.toast('压在下面的拿不动，先拿上面的'); this.render(); return; }
    if (t.loc !== 'board' && t.loc !== 'hold') return;
    const si = this.activeSel(); if (si < 0) return;
    const sc = G.scales[si];
    const from = t.loc;
    if (from === 'hold') G.hold.splice(G.hold.indexOf(t.id), 1);
    t.loc = 'pan'; t.scale = si; t.seen = true; sc.items.push(t.id);
    G.last = { id: t.id, si, from };
    this.deps.sfx.tap(); coverOf(G.tiles); this.render(); this.resolve(si);
  }
  private resolve(si: number) {
    const G = this.G!, sc = G.scales[si], s = sumOf(G, sc);
    if (s === sc.T) this.balance(si);
    else if (s > sc.T) this.overflow(si, `超了 ${s - sc.T}g，翻盘了！`, `+${s - sc.T}g`);
    else if (sc.items.length >= PAN_MAX) this.overflow(si, `${PAN_MAX} 包放满还差 ${sc.T - s}g，翻盘了！`, `差${sc.T - s}g`);
    else { if (sc.T - s <= 2) this.deps.sfx.near(); this.checkStuck(); }
  }
  private balance(si: number) {
    const sc = this.G!.scales[si]; this.G!.busy = true;
    this.deps.sfx.ding();
    sc.flashN++; this.render();
    this.later(() => {
      const G = this.G!, save = this.save;
      sc.items.forEach((id, j) => { const t = G.tiles[id]; t.loc = 'gone'; t.goneJ = j; });
      const pr = scaleGeom(G, sc, si).pr;
      this.burst(pr.x, pr.y - 10, 16); this.floatText(SC_X[si], 110, '平！+1 方');
      sc.items = []; G.done++;
      const nt = G.queue.shift(); if (nt === undefined) sc.retired = true; else sc.T = nt;
      if ((save.best[G.lv] || 0) < G.done) { save.best[G.lv] = G.done; this.persist(); }
      G.last = null; G.busy = false; this.activeSel(); this.render();
      if (G.scales.every(s => s.retired)) this.win(); else this.checkStuck();
    }, 430);
  }
  private overflow(si: number, msg: string, ft: string) {
    const sc = this.G!.scales[si]; this.G!.busy = true; this.render();
    this.deps.sfx.thud(); this.toast(msg); this.floatText(SC_X[si] + 30, 120, ft, true);
    this.later(() => {
      const G = this.G!;
      for (const id of sc.items) { const t = G.tiles[id]; t.loc = 'hold'; t.scale = -1; G.hold.push(id); }
      sc.items = []; G.last = null; G.busy = false; this.render();
      if (G.hold.length > G.cap) this.lose('overflow'); else this.checkStuck();
    }, 560);
  }
  private lastValid() { const G = this.G!, L = G.last; if (!L) return false; const sc = G.scales[L.si]; return sc.items[sc.items.length - 1] === L.id; }
  undo() {
    const G = this.G!;
    if (G.busy || G.over || G.props.undo <= 0 || !this.lastValid()) return;
    const L = G.last!, t = G.tiles[L.id], sc = G.scales[L.si];
    sc.items.pop(); t.scale = -1;
    if (L.from === 'board') t.loc = 'board'; else { t.loc = 'hold'; G.hold.push(t.id); }
    G.props.undo--; G.last = null; this.deps.sfx.sel(); coverOf(G.tiles); this.render();
  }
  peek() {
    const G = this.G!;
    if (G.busy || G.over || G.props.peek <= 0) return;
    G.props.peek--; G.peekUntil = this.now() + 5000; this.deps.sfx.near(); this.render();
    this.later(() => { if (this.G) this.render(); }, 5050);
  }
  swap() {
    const G = this.G!, si = this.activeSel();
    if (G.busy || G.over || G.props.swap <= 0 || !G.queue.length || si < 0) return;
    const sc = G.scales[si], old = sc.T; sc.T = G.queue.shift()!; G.queue.push(old);
    G.props.swap--; this.deps.sfx.sel(); this.toast(`换成了 ${sc.T}g 的方子`); this.render(); this.resolve(si);
  }
  private checkStuck() {
    const G = this.G!;
    if (G.over || G.busy) return;
    if (G.tiles.some(t => t.loc === 'board')) return;
    const act = G.scales.filter(s => !s.retired); if (!act.length) return;
    const ws = G.tiles.filter(t => t.loc === 'hold' || t.loc === 'pan').map(t => t.w), n = ws.length;
    const ok = (T: number) => { for (let a = 0; a < n; a++) { if (ws[a] === T) return true; for (let b = a + 1; b < n; b++) { if (ws[a] + ws[b] === T) return true; for (let c = b + 1; c < n; c++) if (ws[a] + ws[b] + ws[c] === T) return true; } } return false; };
    if (!act.some(s => ok(s.T)) && !(G.props.swap > 0 && G.queue.length)) this.lose('stuck');
  }
  restart() { const G = this.G; if (G && !G.busy) this.startLevel(G.lv); }
  toggleSound() { const save = this.save; save.sound = !save.sound; this.persist(); if (save.sound) this.deps.sfx.sel(); this.render(); }

  /* 结算 */
  private nearMiss() {
    const G = this.G!;
    let best: { i: number; d: number } | null = null;
    G.scales.forEach((sc, i) => { if (sc.retired) return; const s = sumOf(G, sc), d = sc.T - s; if (s > 0 && d > 0 && (!best || d < best.d)) best = { i, d }; });
    return best as { i: number; d: number } | null;
  }
  private lose(kind: 'overflow' | 'stuck') {
    const G = this.G!, save = this.save;
    G.over = true; this.render(); this.deps.sfx.lose();
    const nm = this.nearMiss(), best = save.best[G.lv] || 0, left = G.total - G.done;
    const line: [string, string, string] = nm && nm.d <= 3 ? [`第 ${nm.i + 1} 台秤只差 `, `${nm.d}g`, ' 就平了'] : ['还有 ', `${left}`, ' 张方子没称'];
    let cmp = '';
    if (G.done > G.prevBest && G.prevBest > 0) cmp = `新纪录，比上次多称了 ${G.done - G.prevBest} 方`;
    else if (G.done === G.prevBest && G.done > 0) cmp = '追平了你的最好成绩';
    else if (G.done < best) cmp = `离你的最好成绩只差 ${best - G.done} 方`;
    const canRevive = kind === 'overflow' && G.revive > 0 && G.hold.length <= G.cap + 3;
    this.modal = { kind: 'lose', title: kind === 'overflow' ? '暂存台堆满了' : '这几包凑不齐了', line, sub: cmp || '差一点点', done: `${G.done}/${G.total}`, attempts: save.attempts[G.lv], canRevive };
    this.render();
  }
  revive() { const G = this.G!; G.revive--; G.cap = Math.max(G.cap + 2, G.hold.length + 1); G.over = false; this.modal = null; this.render(); this.checkStuck(); }
  retry() { this.startLevel(this.G!.lv); }
  private win() {
    const G = this.G!, save = this.save;
    G.over = true; this.render(); this.deps.sfx.win();
    for (let k = 0; k < 5; k++) this.later(() => this.burst(60 + this.random() * 270, 150 + this.random() * 350, 22), k * 160);
    const lv = G.lv, att = save.attempts[lv];
    save.best[lv] = G.total; save.level = lv + 1; this.persist();
    const msg = lv === 1 ? '热身结束。下一关有盲包、抽屉和凑不上的干扰包，关键那一包总在最底下。' : lv === 2 ? `第 ${att} 次挑战拿下了第二关。` : `第 ${att} 次挑战通关。`;
    this.modal = { kind: 'win', sub: msg, total: G.total, attempts: att, next: lv + 1 };
    this.render();
  }
  next() { if (this.modal?.kind === 'win') this.startLevel(this.modal.next); }
  private intro() { this.modal = { kind: 'intro' }; this.render(); }
  go() { this.save.intro = true; this.persist(); this.deps.sfx.unlock(); this.modal = null; this.render(); }
}
