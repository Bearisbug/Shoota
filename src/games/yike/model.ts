// 旧版 render() 拆成纯函数：秤的角度与吊盘位置、药包落在哪、各处文字。坐标都在旧版 390×760 逻辑舞台里，
// 舞台按横竖屏分成秤、台面、暂存台三块后各自平移，见 fit.ts；这里只给出每样东西属于哪一块。
import { LIGHT_MAX, PAN_MAX } from './gen';
import type { GameState, Scale, Tile } from './engine';

export const W = 390, H = 760, HALF = 23, BX = 34, BY = 229, DY = 506, PIV = 114, ARM = 40, HANG = 44, SC_X = [65, 195, 325];

export type Group = 'S' | 'B' | 'T'; // 秤 / 台面（含抽屉）/ 暂存台

export function sumOf(G: GameState, sc: Scale) { return sc.items.reduce((a, id) => a + G.tiles[id].w, 0); }
export function angOf(G: GameState, sc: Scale) { if (sc.retired) return 0; const d = sumOf(G, sc) - sc.T; if (d === 0) return 0; const m = Math.min(13, 2.6 + (Math.abs(d) - 1) * 1.6); return d > 0 ? m : -m; }

export interface ScaleGeom { a: number; xL: number; yL: number; xR: number; yR: number; pr: { x: number; y: number } }
export function scaleGeom(G: GameState, sc: Scale, i: number): ScaleGeom {
  const cx = SC_X[i], a = angOf(G, sc), r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const xL = cx - ARM * c, yL = PIV - ARM * s, xR = cx + ARM * c, yR = PIV + ARM * s;
  return { a, xL, yL, xR, yR, pr: { x: xR, y: yR + HANG } };
}

export function drawerX(d: number, k: number) { return d === 0 ? 34 + k * 7 : 310 - k * 7; }

// 抽屉底座与标签，开局时按抽屉里的药包数定下
export interface DrawerBox { d: number; x0: number; x1: number }
export function drawerBoxes(dr: [number, number]): DrawerBox[] {
  const out: DrawerBox[] = [];
  dr.forEach((n, d) => {
    if (!n) return;
    out.push({ d, x0: Math.min(drawerX(d, 0), drawerX(d, n - 1)) - 6, x1: Math.max(drawerX(d, 0), drawerX(d, n - 1)) + 52 });
  });
  return out;
}

export function trayGeom(cap: number) {
  const step = Math.min(50, 350 / cap), x0 = 10 + (370 - cap * step) / 2, sz = step - 6;
  return { step, x0, sz };
}

export interface Spot { g: Group; x: number; y: number; s: number; z: number; up?: boolean } // up：收走时在吊盘位置上再往上飘 30
export function tileSpot(G: GameState, t: Tile, geoms: ScaleGeom[]): Spot | null {
  if (t.loc === 'board' && t.src === 'd') return { g: 'B', x: drawerX(t.d!, t.k!), y: DY, s: 1, z: 40 + t.k! };
  if (t.loc === 'board') return { g: 'B', x: BX + t.gx! * HALF, y: BY + t.gy! * HALF + (G.maxL / 2 - t.layer!) * 2.5, s: 1, z: 10 + t.layer! };
  if (t.loc === 'pan') { const pr = geoms[t.scale].pr, j = G.scales[t.scale].items.indexOf(t.id); return { g: 'S', ...panSpot(pr, j) }; }
  if (t.loc === 'hold') { const { step, x0, sz } = trayGeom(G.cap), k = G.hold.indexOf(t.id); return { g: 'T', x: x0 + k * step + 3, y: 594 + (56 - sz) / 2, s: sz / 46, z: 60 }; }
  // 收走的药包：旧版不再重排，停在平秤那一刻的吊盘位置（秤平时角度为 0）
  if (t.loc === 'gone') return { g: 'S', ...panSpot({ x: SC_X[t.scale] + ARM, y: PIV + HANG }, t.goneJ ?? 0), up: true };
  return null;
}
function panSpot(pr: { x: number; y: number }, j: number) {
  return { x: pr.x - 21 + (j % 2) * 22, y: pr.y - 21 - (j >> 1) * 17, s: 20 / 46, z: 100 + j };
}

export interface TileLook { cov: boolean; peek: boolean; inpan: boolean; blind: boolean; gone: boolean; weight: string | null; tag: string | null; label: string }
export function tileLook(t: Tile, peek: boolean): TileLook {
  if (t.loc === 'gone') return { cov: false, peek: false, inpan: true, blind: false, gone: true, weight: String(t.w), tag: null, label: `${t.herb[0]} ${t.w} 克` };
  const covered = t.loc === 'board' && t.cov;
  const hidden = !t.seen && !peek;
  const heavy = t.w <= LIGHT_MAX ? '轻' : '重';
  return {
    cov: covered, peek: covered && peek, inpan: t.loc === 'pan', blind: hidden && !covered, gone: false,
    weight: hidden ? null : String(t.w), // null 显示「?」
    tag: hidden ? heavy : null,
    label: covered && !peek ? '被压住的药包' : hidden ? `${t.herb[0]}，盲包，偏${heavy}` : `${t.herb[0]} ${t.w} 克`,
  };
}

// 秤下方的说明：要称多少、还差多少、平了、超了
export interface ScaleLabel { tone: '' | 'near' | 'even'; text: string; small?: { text: string; last: boolean } }
export function scaleLabel(G: GameState, sc: Scale): ScaleLabel {
  const sum = sumOf(G, sc), d = sc.T - sum;
  if (sc.retired) return { tone: '', text: '这方抓齐了' };
  if (sum === 0) return { tone: '', text: `要称 ${sc.T}g`, small: { text: `最多放 ${PAN_MAX} 包`, last: false } };
  if (d > 0) { const left = PAN_MAX - sc.items.length; return { tone: d <= 2 ? 'near' : '', text: `还差 ${d}g`, small: { text: left === 1 ? '只剩 1 包的位置' : `还能放 ${left} 包`, last: left === 1 } }; }
  if (d === 0) return { tone: 'even', text: '平了！' };
  return { tone: 'near', text: `超了 ${-d}g` };
}

export function lastValid(G: GameState) { const L = G.last; if (!L) return false; const sc = G.scales[L.si]; return sc.items[sc.items.length - 1] === L.id; }

// 三个道具：剩几次、能不能点
export interface PropState { n: number; disabled: boolean }
export function propStates(G: GameState) {
  const p = (n: number, ok: boolean): PropState => ({ n, disabled: n <= 0 || !ok || G.busy || G.over });
  return {
    undo: p(G.props.undo, !!G.last && lastValid(G)),
    peek: p(G.props.peek, G.tiles.some(t => t.loc === 'board' && (t.cov || !t.seen))),
    swap: p(G.props.swap, G.queue.length > 0 && !G.scales[G.sel].retired),
  };
}
