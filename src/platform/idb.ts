// 本机存档库（docs/DESIGN.md §9 本机存档、FLOW-LAUNCH S2b、RULE-LAUNCH-001）。
// IndexedDB「changju」第 1 版，kv 库放各游戏存档（键 '<玩家>|<游戏>'）与撤销槽（键 'undo:<游戏>'），games 库保留不用；库不升版本。
// 和旧版不同：打开与每次读写都有超时（页面在后台时暂停计时）；失败后丢掉这条连接，下一次调用重新打开，不再落到内存里假装存上了。
import { IDB_NAME, IDB_STORES, IDB_VERSION, LAUNCH, saveKey, type GameSave } from '../shared';
import { player } from './meta';
import { visibleTimeout } from './timer';

export type SaveFail = 'save-timeout' | 'save-error';
export class SaveStoreError extends Error { constructor(readonly why: SaveFail){ super(why); } }

let conn: IDBDatabase | null = null;

function keep(d: IDBDatabase): IDBDatabase {
  if (conn && conn !== d) { d.close(); return conn; } // 超时后迟到的连接：已经有一条可用的就关掉它
  conn = d;
  d.onversionchange = () => { d.close(); if (conn === d) conn = null; };
  d.onclose = () => { if (conn === d) conn = null; };
  return d;
}
function drop(d: IDBDatabase){ if (conn === d) conn = null; try { d.close(); } catch (e) {} }

function open(): Promise<IDBDatabase> {
  if (conn) return Promise.resolve(conn);
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (why: SaveFail) => { if (settled) return; settled = true; stop(); reject(new SaveStoreError(why)); };
    const stop = visibleTimeout(LAUNCH.idbOpenMs, () => fail('save-timeout'));
    try {
      const r = indexedDB.open(IDB_NAME, IDB_VERSION);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore(IDB_STORES.games, { keyPath:'id' }); d.createObjectStore(IDB_STORES.kv); };
      r.onsuccess = () => { const d = keep(r.result); if (settled) return; settled = true; stop(); resolve(d); };
      r.onerror = r.onblocked = () => fail('save-error');
    } catch (e) { fail('save-error'); }
  });
}

// 一个 kv 事务：body 里发请求，事务完成后返回 body 给的结果；报错、中止或超时都抛 SaveStoreError，并丢掉连接
async function inTx<T>(mode: IDBTransactionMode, body: (kv: IDBObjectStore) => () => T): Promise<T> {
  const d = await open();
  return new Promise<T>((resolve, reject) => {
    let settled = false, t: IDBTransaction | undefined;
    const fail = (why: SaveFail) => { if (settled) return; settled = true; stop(); drop(d); reject(new SaveStoreError(why)); };
    const stop = visibleTimeout(LAUNCH.idbReadMs, () => { try { t?.abort(); } catch (e) {} fail('save-timeout'); });
    try {
      t = d.transaction(IDB_STORES.kv, mode);
      const out = body(t.objectStore(IDB_STORES.kv));
      t.oncomplete = () => { if (settled) return; settled = true; stop(); resolve(out()); };
      t.onerror = t.onabort = () => fail('save-error');
    } catch (e) { fail('save-error'); }
  });
}

export function getMany(keys: string[]): Promise<unknown[]> {
  return inTx('readonly', kv => { const qs = keys.map(k => kv.get(k)); return () => qs.map(q => q.result); });
}
// value 为 undefined 时删除这个键；一个事务里写完，要么全写上要么都不写
export function putMany(entries: [key: string, value: unknown][]): Promise<void> {
  return inTx('readwrite', kv => { for (const [k, v] of entries) { if (v === undefined) kv.delete(k); else kv.put(v, k); } return () => undefined; });
}

const asSave = (v: unknown) => v && typeof v === 'object' ? v as GameSave : undefined;

/* ───────── 同一款游戏的本机读写排成一队：启动读档等云同步把这一款写完再读（§16 竞态「启动时云同步正在写同一款」） ───────── */
const lanes = new Map<string, Promise<unknown>>();
export function queueGame<T>(gid: string, fn: () => Promise<T>): Promise<T> {
  const next = (lanes.get(gid) ?? Promise.resolve()).then(fn);
  const tail = next.catch(() => {});
  lanes.set(gid, tail);
  void tail.then(() => { if (lanes.get(gid) === tail) lanes.delete(gid); });
  return next;
}

/* ───────── 正在本标签页里启动或游玩的游戏：云同步不往本机写这几款（§16 竞态「同步拉回正在玩的游戏」） ───────── */
const held = new Set<string>();
export const holdGame = (gid: string) => { held.add(gid); };
export const releaseGame = (gid: string) => { held.delete(gid); };
export const isHeld = (gid: string) => held.has(gid);
export const anyHeld = () => held.size > 0;

// 这次打开时读档失败的游戏：不开局、不写回、不上云（RULE-LAUNCH-001），直到再读成功
const readFailed = new Set<string>();
export const readFailedThisTime = (gid: string) => readFailed.has(gid);

export type ReadResult = { ok: true; save: GameSave | undefined } | { ok: false; why: SaveFail };

// 启动时读一款游戏的存档；没有存档时 save 为 undefined，用空存档开局。失败不重试，重试由启动流程决定
export function readSave(gid: string): Promise<ReadResult> {
  return queueGame(gid, async (): Promise<ReadResult> => {
    try {
      const [v] = await getMany([saveKey(gid, player())]);
      readFailed.delete(gid);
      return { ok:true, save:asSave(v) };
    } catch (e) {
      readFailed.add(gid);
      return { ok:false, why:e instanceof SaveStoreError ? e.why : 'save-error' };
    }
  });
}

// 写一款游戏的存档；返回是否写上
export function writeSave(gid: string, save: GameSave): Promise<boolean> {
  return queueGame(gid, () => putMany([[saveKey(gid, player()), save]]).then(() => true, () => false));
}

// 一次读出多款游戏的存档，只含有存档的；存档库读不出时抛 SaveStoreError
export async function readSaves(gids: string[]): Promise<Record<string, GameSave>> {
  const email = player(), vals = await getMany(gids.map(g => saveKey(g, email))), out: Record<string, GameSave> = {};
  gids.forEach((g, i) => { const s = asSave(vals[i]); if (s) out[g] = s; });
  return out;
}

// 搬家沿用旧版语义：读不出当作没有、写不上不报错（旧版这时落到内存里，关页面即丢）
export const getSaveLoose = (gid: string) => getMany([saveKey(gid, player())]).then(([v]) => v, () => undefined);
export const putSaveLoose = (gid: string, save: unknown) => putMany([[saveKey(gid, player()), save]]).catch(() => {});
