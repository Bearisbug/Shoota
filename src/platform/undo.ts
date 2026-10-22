// 撤销槽（docs/DESIGN.md FLOW-CLOUD-CONFLICT S2、S4，§9 撤销槽，§15 撤销槽保留 30 天）：
// 本机存档被云端那份替换前留一份在 IndexedDB kv 库的 undo:<游戏>，每款一份，新的覆盖旧的，30 天后删。
import { CLOUD, saveKey, undoKey, type GameSave, type GameStat, type UndoSlot } from '../shared';
import { CATALOG } from '../catalog';
import { FORCE_PUSH, readCloud, requestSync, withCloudLock, writeCloud } from './cloudState';
import { getMany, putMany, queueGame } from './idb';
import { peek, persist, player, stat } from './meta';

const KEEP_MS = CLOUD.undoKeepDays * 86_400_000;
const live = (s: unknown, now: number): s is UndoSlot => !!s && typeof s === 'object' && now - (s as UndoSlot).at < KEEP_MS;
const copyStat = (s: GameStat | null): GameStat | null => s && { ...s, ach:{ ...s.ach } };

// 把本机这份放进撤销槽，同时换成 next：一个事务里写完。调用方已在这款游戏的读写队列里
export async function keepUndo(gid: string, replaced: GameSave, why: UndoSlot['why'], next: GameSave): Promise<boolean> {
  const slot: UndoSlot = { save:replaced, stat:copyStat(peek(gid)), at:Date.now(), why };
  return putMany([[saveKey(gid, player()), next], [undoKey(gid), slot]]).then(() => true, () => false);
}

// 30 天内的撤销槽，游戏库据此在被替换的游戏旁显示撤销
export async function listUndo(): Promise<Record<string, UndoSlot>> {
  const now = Date.now(), vals = await getMany(CATALOG.map(g => undoKey(g.id))), out: Record<string, UndoSlot> = {};
  CATALOG.forEach((g, i) => { const v = vals[i]; if (live(v, now)) out[g.id] = v; });
  return out;
}

// 打开平台时删掉过期的撤销槽
export async function pruneUndo(): Promise<void> {
  const now = Date.now(), keys = CATALOG.map(g => undoKey(g.id)), vals = await getMany(keys);
  const gone = keys.filter((_, i) => vals[i] !== undefined && !live(vals[i], now));
  if (gone.length) await putMany(gone.map(k => [k, undefined]));
}

// 撤销：本机换回撤销槽那份，清掉槽，下次同步强制推上云端成为新版本；推送没送到时之后的同步接着强制推。
// 槽不存在或已过期返回 false；存档库写不进时抛 SaveStoreError，本机不变
export async function restoreUndo(gid: string): Promise<boolean> {
  const done = await withCloudLock(true, () => queueGame(gid, async () => {
    const [v] = await getMany([undoKey(gid)]);
    if (!live(v, Date.now())) { if (v !== undefined) await putMany([[undoKey(gid), undefined]]); return false; }
    await putMany([[saveKey(gid, player()), v.save], [undoKey(gid), undefined]]);
    if (v.stat) { const s = stat(gid)!; Object.assign(s, v.stat, { ach:{ ...v.stat.ach, ...s.ach } }); persist(); }
    const st = readCloud();
    if (st) { st.games[gid] = { rev:st.games[gid]?.rev ?? 0, hash:FORCE_PUSH, at:Date.now() }; writeCloud(st); }
    return true;
  }));
  if (done) requestSync();
  return !!done;
}
