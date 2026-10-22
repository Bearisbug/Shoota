// 存档码（docs/DESIGN.md §9 存档码、REQ-020、FLOW-BACKUP）：'CJ1' + base64(gzip(JSON))；浏览器不支持压缩时退回 'CJ0' + base64(JSON)。
// 编码、解码、打包与导入逐行沿用旧版 public/index.html（dd731d6）的 encodeSaves、decodeSaves、packSaves、applySaves；
// public/move.html 的搬家页用同一种格式。
import { saveKey, type GameStat, type SavePackV1 } from '../shared';
import { CATALOG, gameById } from '../catalog';
import { canGunzip, canGzip, fromBase64, gunzip, gzip, toBase64, utf8 } from './codec';
import { putMany, readSaves } from './idb';
import { meta, peek, persist, player } from './meta';

export async function encodeSaves(d: SavePackV1): Promise<string> {
  let bytes = utf8(JSON.stringify(d)), tag = 'CJ0';
  if (canGzip()) { bytes = await gzip(bytes); tag = 'CJ1'; }
  return tag + toBase64(bytes);
}

// 读不出时抛 Error：message 为 'old' 是浏览器太旧解不了 CJ1，其余为 'bad'
export async function decodeSaves(code: string): Promise<SavePackV1> {
  code = code.replace(/\s+/g, '');
  const tag = code.slice(0, 3);
  if (tag === 'CJ1' && !canGunzip()) throw new Error('old');
  if (tag !== 'CJ0' && tag !== 'CJ1') throw new Error('bad');
  let bytes = fromBase64(code.slice(3));
  if (tag === 'CJ1') bytes = await gunzip(bytes);
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (!d || d.v !== 1 || !d.saves || typeof d.saves !== 'object') throw new Error('bad');
  return d;
}

// 打包这台设备的进度：目录里每款有存档或玩过的都收。存档库读不出时抛 SaveStoreError，不打出一份空存档
export async function packSaves(): Promise<SavePackV1> {
  const email = player(), kvs = await readSaves(CATALOG.map(g => g.id));
  const saves: SavePackV1['saves'] = {}, stats: Record<string, GameStat> = {};
  for (const g of CATALOG) {
    const ls = kvs[g.id], s = peek(g.id);
    if ((ls && Object.keys(ls).length) || s?.seconds) { saves[g.id] = ls || {}; if (s) stats[g.id] = s; }
  }
  return { v:1, at:Date.now(), saves, stats, wish:meta().wish[email] || [], achDefs:meta().achDefs };
}

// 存档码导入（存档页两步确认之后）：目录里有的游戏逐款直接替换，不比时长；返回导入了几款。写不进存档库时抛 SaveStoreError，元数据不动
export async function applySaves(d: SavePackV1): Promise<number> {
  const m = meta(), email = player(), ids = Object.keys(d.saves).filter(id => gameById(id));
  await putMany(ids.map(id => [saveKey(id, email), d.saves[id]]));
  m.stats[email] ??= {};
  for (const id of ids) {
    m.stats[email][id] = d.stats?.[id] || { seconds:0, last:d.at, ach:{}, status:'' };
    if (d.achDefs?.[id]) m.achDefs[id] = d.achDefs[id];
  }
  m.wish[email] = [...new Set([...(m.wish[email] || []), ...(d.wish || []).filter(id => gameById(id))])];
  persist();
  return ids.length;
}
