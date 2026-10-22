// changju.ui.v1：悬浮按钮按游戏、按方向记的位置，已提示过旋转的游戏，引导弹出时间（§9），
// 以及改写游戏的顶部信息区按游戏、按方向记的展开状态（ADR-006）。
// 读坏了或写不了 localStorage 都当作没有偏好，不影响开局。

import { UI_KEY, type FloatSpot, type UiPrefsV1 } from '../../shared/save';
import type { ShellOrientation, ShellPrefs } from '../../sdk/core/protocolExt';

// shell 字段待并入 shared/save.ts 的 UiPrefsV1；其余字段原样保留
type Prefs = UiPrefsV1 & { shell?: Record<string, ShellPrefs> };

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

const blank = (): Prefs => ({ v: 1, float: {}, rotateHintSeen: {} });

export function readPrefs(store: Storage | null = safeLocal()): Prefs {
  try {
    const raw = store?.getItem(UI_KEY);
    if (!raw) return blank();
    const p = JSON.parse(raw) as Partial<Prefs>;
    if (!p || p.v !== 1) return blank();
    return { ...blank(), ...p, float: { ...p.float }, rotateHintSeen: { ...p.rotateHintSeen }, ...(p.shell ? { shell: { ...p.shell } } : {}) };
  } catch {
    return blank();
  }
}

export function updatePrefs(fn: (p: Prefs) => void, store: Storage | null = safeLocal()) {
  const p = readPrefs(store);
  fn(p);
  try { store?.setItem(UI_KEY, JSON.stringify(p)); } catch { /* 存不住就算了 */ }
}

export const isSpot = (s: unknown): s is FloatSpot =>
  !!s && typeof s === 'object' && ((s as FloatSpot).side === 'left' || (s as FloatSpot).side === 'right')
  && typeof (s as FloatSpot).y === 'number' && (s as FloatSpot).y >= 0 && (s as FloatSpot).y <= 1;

export function floatSpot(gid: string, orientation: 'portrait' | 'landscape', store?: Storage | null): FloatSpot | null {
  const s = readPrefs(store).float[gid]?.[orientation];
  return isSpot(s) ? s : null;
}

export function saveFloatSpot(gid: string, orientation: 'portrait' | 'landscape', spot: FloatSpot | null, store?: Storage | null) {
  updatePrefs(p => {
    const cur = { ...p.float[gid] };
    if (spot) cur[orientation] = spot;
    else delete cur[orientation];
    if (cur.portrait || cur.landscape) p.float[gid] = cur;
    else delete p.float[gid];
  }, store);
}

export function shellPrefs(gid: string, store?: Storage | null): ShellPrefs {
  const s = readPrefs(store).shell?.[gid];
  const out: ShellPrefs = {};
  if (s?.portrait === true) out.portrait = true;
  if (s?.landscape === true) out.landscape = true;
  return out;
}

export function saveShellPref(gid: string, orientation: ShellOrientation, expanded: boolean, store?: Storage | null) {
  updatePrefs(p => {
    const all = { ...p.shell };
    const cur = { ...all[gid] };
    if (expanded) cur[orientation] = true;
    else delete cur[orientation];
    if (cur.portrait || cur.landscape) all[gid] = cur;
    else delete all[gid];
    p.shell = all;
  }, store);
}

function safeLocal(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
