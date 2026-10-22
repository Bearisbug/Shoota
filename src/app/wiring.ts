// 平台页面与游戏运行层的接线：PlatformServices 与 PlayerPorts 都落到 src/platform。
// 快照只在数据可能变了的时候重算：换页（退出游戏回到平台页也是换页）、云存档事件、切回前台，以及页面自己改数据之后。
import { gameById, type GameEntry } from '../catalog';
import type { GameStat } from '../shared';
import {
  adopt, applySaves, boot, cloudStatus, decodeSaves, encodeSaves, listUndo, meta, onCloud, packSaves, persist,
  player as playerKey, playUser, readSave, recover, restoreUndo, stat, toggleWish, track,
} from '../platform';
import { requestSync } from '../platform/cloudState';
import { holdGame, releaseGame, writeSave } from '../platform/idb';
import { prepareLaunch } from './player/player';
import { configurePlayer, type PlayerPorts } from './player/ports';
import type { CloudView, PlatformServices, PlatformSnapshot } from './services';

const blankStat = (): GameStat => ({ seconds: 0, last: 0, ach: {}, status: '' });

export function createServices(): PlatformServices {
  const listeners = new Set<() => void>();
  const replacedListeners = new Set<(gids: string[]) => void>();
  let noticeCode: string | null = null; // 这个标签页里刚开通的云存档，商店顶部提示一次
  let undo: PlatformSnapshot['undo'] = {};
  let snap: PlatformSnapshot | null = null;
  let snapJson = '';

  function build(): PlatformSnapshot {
    const m = meta(), p = playerKey(), st = cloudStatus();
    const cloud: CloudView | null = st.code
      ? { code: st.code, lastSyncAt: st.lastSyncAt, tooBig: st.tooBig, stopped: st.phase === 'unavailable', notice: noticeCode === st.code }
      : null;
    // 平台元数据是原地改的，快照拷一份，数据没变时沿用上一个对象
    return JSON.parse(JSON.stringify({ stats: m.stats[p] || {}, wish: m.wish[p] || [], achDefs: m.achDefs || {}, cloud, undo }));
  }

  function bump() {
    const next = build(), json = JSON.stringify(next);
    if (snap && json === snapJson) return;
    snap = next;
    snapJson = json;
    listeners.forEach(fn => fn());
  }

  async function refreshUndo() {
    try {
      const slots = await listUndo();
      undo = Object.fromEntries(Object.entries(slots).map(([g, s]) => [g, { at: s.at, why: s.why }]));
    } catch { /* 存档库读不出：撤销入口先不显示 */ }
    bump();
  }

  onCloud(e => {
    if (e.type === 'created') noticeCode = e.code;
    if (e.type === 'replaced') {
      void refreshUndo();
      if (e.why === 'conflict') replacedListeners.forEach(fn => fn(e.games));
    }
    bump();
  });
  window.addEventListener('hashchange', () => {
    bump();
    if (location.hash === '#library') void refreshUndo();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) bump(); });

  configurePlayer(playerPorts());

  return {
    async boot() {
      if (!(await boot())) return false;
      await refreshUndo();
      return true;
    },
    getSnapshot: () => snap ?? (bump(), snap!),
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    toggleWish(gid) {
      const on = toggleWish(gid);
      bump();
      return on;
    },
    track,
    packSaves,
    encodeSaves,
    decodeSaves,
    async applySaves(pack) {
      const n = await applySaves(pack);
      bump();
      return n;
    },
    dismissCloudNotice() {
      noticeCode = null;
      bump();
    },
    recoverLookup: input => recover(input),
    async recoverAdopt(saveId, code) {
      const r = await adopt(saveId, code);
      await refreshUndo();
      return r;
    },
    async restoreUndo(gid) {
      const ok = await restoreUndo(gid);
      await refreshUndo();
      return ok;
    },
    onCloudReplaced(fn) {
      replacedListeners.add(fn);
      return () => { replacedListeners.delete(fn); };
    },
    beforeLaunch: (game: GameEntry) => prepareLaunch(game),
  };
}

// 游戏运行层用到的平台能力（src/app/player/ports.ts 的形状）
function playerPorts(): PlayerPorts {
  return {
    readSave,
    writeSave,
    hold: holdGame,
    release: releaseGame,
    user: playUser,
    stat: gid => stat(gid) ?? blankStat(),
    persist,
    setAchDefs(gid, list) {
      meta().achDefs[gid] = list;
      persist();
    },
    achName: (gid, key) => (gameById(gid)?.achievements || meta().achDefs[gid] || []).find(a => a.key === key)?.name,
    track,
    requestSync,
  };
}

