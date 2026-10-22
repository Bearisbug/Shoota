// 在页面里读写平台的本机数据（docs/TEST.md §3「本机数据构造」），键名与形状取自 src/shared/save.ts。
// 写入前页面要先打开过平台同源的任意地址；IndexedDB 不存在时按第 1 版建 kv 与 games 两个库，和平台一致。
import type { Page } from '@playwright/test';
import { CLOUD_KEY, IDB_NAME, IDB_VERSION, META_KEY, UI_KEY, saveKey, undoKey } from '../../src/shared';
import type { CloudLocalState, GameSave, MetaV1, UiPrefsV1, UndoSlot } from '../../src/shared';

type Op = { kind: 'get' | 'put' | 'del'; key: string; value?: unknown };

// 在页面里对 kv 库做一次读、写或删
function kv(page: Page, op: Op) {
  return page.evaluate(([name, version, o]) => new Promise<unknown>((done, fail) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('games', { keyPath: 'id' });
    };
    req.onerror = () => fail(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const st = db.transaction('kv', o.kind === 'get' ? 'readonly' : 'readwrite').objectStore('kv');
      const r = o.kind === 'get' ? st.get(o.key) : o.kind === 'put' ? st.put(o.value, o.key) : st.delete(o.key);
      r.onsuccess = () => { db.close(); done(o.kind === 'get' ? r.result : undefined); };
      r.onerror = () => { db.close(); fail(r.error); };
    };
  }), [IDB_NAME, IDB_VERSION, op] as const);
}

export const readSave = (page: Page, gid: string) => kv(page, { kind: 'get', key: saveKey(gid) }) as Promise<GameSave | undefined>;
export const writeSave = (page: Page, gid: string, save: GameSave) => kv(page, { kind: 'put', key: saveKey(gid), value: save });
export const readUndo = (page: Page, gid: string) => kv(page, { kind: 'get', key: undoKey(gid) }) as Promise<UndoSlot | undefined>;
export const writeUndo = (page: Page, gid: string, slot: UndoSlot) => kv(page, { kind: 'put', key: undoKey(gid), value: slot });

const readLs = <T>(page: Page, key: string) => page.evaluate(k => {
  const s = localStorage.getItem(k);
  return s === null ? null : JSON.parse(s);
}, key) as Promise<T | null>;
const writeLs = (page: Page, key: string, value: unknown) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, value] as const);

export const readMeta = (page: Page) => readLs<MetaV1>(page, META_KEY);
export const writeMeta = (page: Page, meta: Partial<MetaV1>) => writeLs(page, META_KEY, meta);
export const readCloud = (page: Page) => readLs<CloudLocalState>(page, CLOUD_KEY);
export const writeCloud = (page: Page, state: CloudLocalState) => writeLs(page, CLOUD_KEY, state);
export const readUi = (page: Page) => readLs<UiPrefsV1>(page, UI_KEY);

// 旧版平台写下的元数据：本机玩家、各游戏累计时长与最近游玩；不带旅客编号时首次打开会被记为老玩家
export function oldMeta(played: Record<string, { seconds: number; last: number; status?: string }>, extra: Partial<MetaV1> = {}): Partial<MetaV1> {
  const now = Date.now();
  const stats = Object.fromEntries(Object.entries(played).map(([g, s]) => [g, { seconds: s.seconds, last: s.last, ach: {}, status: s.status ?? '' }]));
  return { session: { email: 'local', at: now }, users: { local: { nickname: '玩家', created: now } }, stats: { local: stats }, wish: { local: [] }, achDefs: {}, sendLog: {}, ...extra };
}

// 一克之差打到第 5 关的存档（与旧版走查用的同一份）
export const YIKE_LEVEL5: GameSave = {
  'yikezhicha.v2': JSON.stringify({ level: 5, attempts: { 1: 1, 2: 2, 3: 1, 4: 3, 5: 1 }, best: { 1: 3, 2: 2, 3: 3, 4: 1 }, sound: true, intro: true }),
};

// 在平台已写下的元数据上改几项，其余字段原样保留；没有元数据时从旧版写法起步
export async function patchMeta(page: Page, fn: (m: MetaV1) => void) {
  const m = (await readMeta(page)) ?? (oldMeta({}) as MetaV1);
  fn(m);
  await writeLs(page, META_KEY, m);
}

// 本机玩家某款游戏的统计，没有就建一条
export function statOf(m: MetaV1, gid: string) {
  const player = m.session?.email ?? 'local';
  m.stats[player] ??= {};
  return (m.stats[player][gid] ??= { seconds: 0, last: Date.now(), ach: {}, status: '' });
}

export const idbVersion = (page: Page) => page.evaluate(async name => (await indexedDB.databases()).find(d => d.name === name)?.version, IDB_NAME);
