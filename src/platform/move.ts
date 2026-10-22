// 存档搬到 https（docs/DESIGN.md FLOW-SAVE-MOVE S3、S4，ADR-004，保留到 2026-11-21，期间不改行为）：
// 搬家页把 http 下的数据打包成存档码，带在 #move= 后面回来；返回 http 下是否有平台数据。逐行沿用旧版 public/index.html（dd731d6）的 moveIn。
import { MOVED_KEY, type MergeBody, type SavePackV1 } from '../shared';
import { gameById } from '../catalog';
import { getSaveLoose, putSaveLoose } from './idb';
import { meta, peek, persist, player } from './meta';
import { decodeSaves } from './savecode';

type MovePack = SavePackV1 & { vid?: unknown; had?: unknown }; // 搬家页另带 http 下的旅客编号与是否有平台数据

export async function moveIn(): Promise<boolean> {
  const h = location.hash.slice(6), i = h.indexOf('&r='), code = i < 0 ? h : h.slice(0, i);
  let st: string | null = null, back = '';
  try { st = localStorage.getItem(MOVED_KEY); back = i < 0 ? '' : decodeURIComponent(h.slice(i + 3)); } catch (e) {}
  history.replaceState(null, '', location.pathname + location.search + (back ? '#' + back : ''));
  if (!st || st === 'done') return false; // 本机没有发起搬家，地址里的数据不认
  try {
    if (!code) return false;
    const d: MovePack = await decodeSaves(code), m = meta(), email = player();
    m.stats[email] ??= {};
    for (const id of new Set([...Object.keys(d.saves), ...Object.keys(d.stats || {})])) {
      if (!gameById(id)) continue;
      const mine = peek(id), theirs = d.stats?.[id];
      if ((mine || await getSaveLoose(id)) && (theirs?.seconds || 0) <= (mine?.seconds || 0)) continue; // 留累计时长更长的那份
      if (d.saves[id]) await putSaveLoose(id, d.saves[id]);
      if (theirs) m.stats[email][id] = theirs;
      if (d.achDefs?.[id]) m.achDefs[id] ??= d.achDefs[id];
    }
    m.wish[email] = [...new Set([...(m.wish[email] || []), ...(d.wish || []).filter(id => gameById(id))])];
    if (typeof d.vid === 'string' && /^[0-9a-f]{32}$/.test(d.vid) && d.vid !== m.vid) {
      const body: MergeBody = { v:d.vid, from:m.vid as string };
      if (m.vid) fetch('/api/merge', { method:'POST', body:JSON.stringify(body), keepalive:true, headers:{ 'content-type':'application/json' } }).catch(() => {});
      m.vid = d.vid;
    }
    persist();
    return Boolean(d.had);
  } catch (e) { return false; }
  finally { try { localStorage.setItem(MOVED_KEY, 'done'); } catch (e) {} }
}
