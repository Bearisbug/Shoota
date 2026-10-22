// 匿名统计（docs/DESIGN.md FLOW-COLLECT、API-001）：每个浏览器一个随机旅客编号，上报到 /api/e。
// 格式与通道沿用旧版 public/index.html（dd731d6）的 ensureVid、track：每次只发一个事件，老玩家每一批都带 o；先 sendBeacon，不行再 fetch keepalive，失败丢弃。
// 云存档编号不进这里（INV-CLOUD-002）。
import type { CollectBody, CollectEvent } from '../shared';
import { meta, persist } from './meta';

// 编号在搬家之后再领（FLOW-SAVE-MOVE S4）；领编号时本机已有平台数据的是统计上线前就玩过的老玩家，上报带 o
export function ensureVid(prior: boolean){
  const m = meta();
  if (m.vid) return;
  m.vid = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  if (prior) m.old = 1;
  persist();
}

export function track(ev: CollectEvent){
  const m = meta(), v = m.vid as string;
  const b: CollectBody = m.old ? { v, o:1, ev:[ev] } : { v, ev:[ev] };
  const body = JSON.stringify(b);
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/e', new Blob([body], { type:'application/json' }))) return;
  fetch('/api/e', { method:'POST', body, keepalive:true, headers:{ 'content-type':'application/json' } }).catch(() => {});
}
