// 关卡生成，逐行照搬旧版 public/games/yike.html（dd731d6）里 GEN-START～GEN-END 一段：
// 同一关同一种子出同一盘药包，随机数的取用顺序一个都不能变，gen.test.ts 拿旧版源码逐关比对。

export const PAN_MAX = 3, LIGHT_MAX = 6;
const SEEDS: Record<number, number> = { 3: 27999, 4: 36221, 5: 43837, 6: 51857, 7: 59675, 8: 68402, 9: 75513, 10: 83432, 11: 91553, 12: 99472, 13: 107795, 14: 115916 };

type Rand = () => number;

export interface LevelCfg {
  n: number; wmin: number; wmax: number; k3: number; L: number; dr: [number, number];
  decoy: number; blind: number; cruel: number; cap: number; tmax: number; seed?: number;
}

// 药包落点：b 是主台面（gx 0..12，gy 1..9，layer 越大越靠上），d 是左右抽屉（k 越大越靠上）
export interface Spot {
  src: 'b' | 'd';
  gx?: number; gy?: number; layer?: number;
  d?: number; k?: number;
  depth?: number;
}

export interface GenTile extends Spot {
  w: number;
  ti: number; // 属于第几张方子，干扰包是 -1
  key: boolean;
  decoy?: boolean;
  blind?: boolean;
}

export interface Level { targets: number[]; tiles: GenTile[]; cap: number; dr: [number, number] }

export function mulberry32(a: number): Rand { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function cfgFor(lv: number): LevelCfg {
  if (lv === 1) return { n: 3, wmin: 2, wmax: 9, k3: 0, L: 2, dr: [0, 0], decoy: 0, blind: 0, cruel: 0, cap: 6, tmax: 18 };
  if (lv === 2) return { n: 14, wmin: 2, wmax: 15, k3: .45, L: 10, dr: [7, 7], decoy: 9, blind: .4, cruel: .4, cap: 4, tmax: 34, seed: 108 };
  const e = Math.min(lv - 3, 8), h = Math.floor(e / 2);
  return { n: 12 + e, wmin: 2, wmax: e > 3 ? 15 : 14, k3: .45, L: 9 + h, dr: [6 + h, 6 + h], decoy: 7 + h, blind: .3 + e * .015, cruel: .32 + e * .01, cap: 4, tmax: 32, seed: SEEDS[lv] };
}
function pick(a: number, b: number, R: Rand) { return a + Math.floor(R() * (b - a + 1)); }
function shuffle<T>(a: T[], R: Rand): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

interface Cell { gx: number; gy: number; layer: number }

/* 主台面：gx 0..12，gy 1..9；同一层的格子间隔 2，奇偶层错开半格 */
function layoutPositions(N: number, L: number, R: Rand): Spot[] {
  const w: number[] = []; for (let l = 0; l < L; l++) w.push(1.25 - l / L * .5);
  const sw = w.reduce((a, b) => a + b);
  const counts = w.map(x => Math.max(1, Math.round(N * x / sw)));
  let diff = N - counts.reduce((a, b) => a + b), i = 0;
  while (diff !== 0) { const j = i % L; if (diff > 0) { counts[j]++; diff--; } else if (counts[j] > 1) { counts[j]--; diff++; } i++; }
  const pos: Spot[] = [];
  for (let l = 0; l < L; l++) {
    const c = counts[l], ox = l % 2, oy = (l >> 1) % 2;
    const maxC = ox ? 6 : 7, maxR = oy ? 4 : 5;
    let cols = Math.min(maxC, Math.max(ox ? 2 : 3, (ox ? 2 : 1) + 2 * Math.round((Math.sqrt(c * 1.6) - (ox ? 2 : 1)) / 2)));
    let rows = oy ? 2 : 3;
    while (cols * rows < c) { if (rows < maxR) rows += 2; else if (cols < maxC) cols += 2; else break; }
    const cells: Cell[] = [];
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) cells.push({ gx: 6 - (cols - 1) + 2 * a, gy: 5 - (rows - 1) + 2 * b, layer: l });
    const pairs: Cell[][] = [], singles: Cell[][] = [];
    for (const ce of cells) {
      if (ce.gx === 6) { singles.push([ce]); continue; }
      if (ce.gx < 6) pairs.push([ce, cells.find(o => o.gx === 12 - ce.gx && o.gy === ce.gy)!]);
    }
    shuffle(pairs, R); shuffle(singles, R);
    let need = Math.min(c, cells.length); const chosen: Cell[] = [];
    for (const p of pairs) { if (need >= 2) { chosen.push(...p); need -= 2; } }
    for (const s of singles) { if (need >= 1) { chosen.push(...s); need--; } }
    for (const p of pairs) { if (need > 0 && !chosen.includes(p[0])) { chosen.push(p[0]); need--; } }
    pos.push(...chosen.map(p => ({ ...p, src: 'b' as const })));
  }
  return pos;
}
/* 估算每个位置被翻出来的先后：上层越高越早，抽屉越靠上越早 */
function depthOf(p: Spot, L: number, dr: [number, number]) {
  if (p.src === 'b') return 1 - p.layer! / Math.max(1, L - 1);
  return 1.08 - (p.k! + .5) / dr[p.d!];
}
export function genLevel(lv: number, over?: Partial<LevelCfg>): Level {
  const cfg = Object.assign(cfgFor(lv), over || {}), R = mulberry32(cfg.seed || 4242 + lv * 7919);
  const targets: number[] = [], groups: number[][] = [];
  for (let i = 0; i < cfg.n; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const k = R() < cfg.k3 ? 3 : 2, g: number[] = [];
      for (let j = 0; j < k; j++) g.push(pick(cfg.wmin, cfg.wmax, R));
      const T = g.reduce((a, b) => a + b);
      if (T > cfg.tmax || T < 7) continue;
      targets.push(T); groups.push(g); break;
    }
  }
  const items: Omit<GenTile, 'src'>[] = [];
  groups.forEach((g, i) => { const key = Math.floor(R() * g.length); g.forEach((w, j) => items.push({ w, ti: i, key: j === key })); });
  for (let i = 0; i < cfg.decoy; i++) {
    /* 干扰包：偏大的重量，单独放不进当前大多数方子 */
    items.push({ w: pick(Math.max(cfg.wmin, cfg.wmax - 6), cfg.wmax, R), ti: -1, key: false, decoy: true });
  }
  const nD = cfg.dr[0] + cfg.dr[1];
  const pos = layoutPositions(items.length - nD, cfg.L, R);
  for (let d = 0; d < 2; d++) for (let k = 0; k < cfg.dr[d]; k++) pos.push({ src: 'd', d, k });
  pos.forEach(p => p.depth = depthOf(p, cfg.L, cfg.dr) + R() * .06);
  const order = pos.slice().sort((a, b) => b.depth! - a.depth!); /* 浅 -> 深 */
  const used = new Set<number>(), N = order.length;
  const take = (idx: number) => { idx = Math.max(0, Math.min(N - 1, idx)); for (let r = 0; r < N; r++) { for (const s of [1, -1]) { const j = idx + s * r; if (j >= 0 && j < N && !used.has(j)) { used.add(j); return order[j]; } } } };
  const out: GenTile[] = [];
  const keys = items.filter(x => x.key), decs = items.filter(x => x.decoy), rest = shuffle(items.filter(x => !x.key && !x.decoy), R);
  for (const it of keys) { const f = it.ti / cfg.n + cfg.cruel + R() * .12; out.push({ ...it, ...take(Math.round(f * N))! }); }
  for (const it of decs) { out.push({ ...it, ...take(Math.floor(R() * N * .3))! }); }
  const free: Spot[] = []; for (let j = 0; j < N; j++) if (!used.has(j)) free.push(order[j]);
  shuffle(free, R); rest.forEach((it, i) => out.push({ ...it, ...free[i] }));
  for (const t of out) { t.blind = lv > 1 && t.depth! < .97 && R() < cfg.blind; delete t.depth; }
  return { targets, tiles: out, cap: cfg.cap, dr: cfg.dr };
}

// 遮挡：主台面上被更高一层盖住（横竖都差不到 2 格）的看不见；抽屉只露最上面一包
export interface CoverTile { loc: string; src: 'b' | 'd'; gx?: number; gy?: number; layer?: number; d?: number; k?: number; cov: boolean }
export function coverOf(tiles: CoverTile[]) {
  /* tiles: 带 loc 字段；loc==='board' 才参与遮挡 */
  const b = tiles.filter(t => t.loc === 'board');
  const top = [-1, -1];
  for (const t of b) if (t.src === 'd' && t.k! > top[t.d!]) top[t.d!] = t.k!;
  for (const t of b) {
    if (t.src === 'd') t.cov = t.k !== top[t.d!];
    else t.cov = b.some(o => o.src === 'b' && o.layer! > t.layer! && Math.abs(o.gx! - t.gx!) < 2 && Math.abs(o.gy! - t.gy!) < 2);
  }
}
