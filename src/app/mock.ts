// 平台能力的内存版，给页面测试用：快照可直接改，调用记在 calls 里。
import type { GameStat, SavePackV1 } from '../shared';
import type { PlatformServices, PlatformSnapshot, RecoverAdopt, RecoverLookup } from './services';

export interface MockOptions {
  snapshot?: Partial<PlatformSnapshot>;
  pack?: SavePackV1;
  lookup?: RecoverLookup;
  adopt?: RecoverAdopt;
}

export type MockServices = PlatformServices & {
  calls: string[];
  set(patch: Partial<PlatformSnapshot>): void;
};

export const stat = (p: Partial<GameStat> = {}): GameStat => ({ seconds: 0, last: 0, ach: {}, status: '', ...p });

export function createMockServices(o: MockOptions = {}): MockServices {
  let snap: PlatformSnapshot = { stats: {}, wish: [], achDefs: {}, cloud: null, undo: {}, ...o.snapshot };
  const listeners = new Set<() => void>();
  const replaced = new Set<(gids: string[]) => void>();
  const calls: string[] = [];
  const set = (patch: Partial<PlatformSnapshot>) => {
    snap = { ...snap, ...patch };
    listeners.forEach(fn => fn());
  };
  return {
    calls,
    set,
    boot: async () => true,
    getSnapshot: () => snap,
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    toggleWish(gid) {
      const on = !snap.wish.includes(gid);
      set({ wish: on ? [...snap.wish, gid] : snap.wish.filter(id => id !== gid) });
      calls.push('wish:' + gid);
      return on;
    },
    track: ev => { calls.push('track:' + ev.t); },
    packSaves: async () => o.pack ?? { v: 1, at: 0, saves: {}, stats: {}, wish: [], achDefs: {} },
    encodeSaves: async pack => 'CJ0' + btoa(JSON.stringify(pack)),
    decodeSaves: async code => {
      if (!code.startsWith('CJ0')) throw new Error('bad');
      return JSON.parse(atob(code.slice(3))) as SavePackV1;
    },
    applySaves: async pack => Object.keys(pack.saves).length,
    dismissCloudNotice: () => {
      if (snap.cloud) set({ cloud: { ...snap.cloud, notice: false } });
    },
    recoverLookup: async () => o.lookup ?? { ok: false, why: 'unknown' },
    recoverAdopt: async () => o.adopt ?? { ok: true, restored: 0 },
    restoreUndo: async gid => {
      calls.push('undo:' + gid);
      return true;
    },
    onCloudReplaced(fn) {
      replaced.add(fn);
      return () => { replaced.delete(fn); };
    },
    beforeLaunch: game => { calls.push('launch:' + game.id); },
  };
}
