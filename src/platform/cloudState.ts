// 云存档本机状态 changju.cloud.v1（docs/DESIGN.md §9）：单独一个 localStorage 键，旧标签页写回元数据时冲不掉它。
// 每次同步、开通、撤销都先重读这个键，另一个标签页刚改过的也能看到。
import { CLOUD_KEY, type CloudLocalState } from '../shared';

const SAVE_ID = /^[0-9a-f]{32}$/, CODE = /^[0-9A-HJKMNP-TV-Z]{16}$/;

// 撤销后要强制推送的游戏：内容摘要记成这个值，下次同步一定算改过，并带 force 推上去；推成功后换回真实摘要
export const FORCE_PUSH = '!force';

export function readCloud(): CloudLocalState | null {
  try {
    const d = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null');
    if (!d || d.v !== 1 || !SAVE_ID.test(d.saveId) || !CODE.test(d.code)) return null;
    return { v:1, saveId:d.saveId, code:d.code, games:d.games && typeof d.games === 'object' ? d.games : {},
      meta:d.meta && typeof d.meta === 'object' ? d.meta : { rev:0, hash:'' }, lastSyncAt:Number(d.lastSyncAt) || 0, tooBig:Array.isArray(d.tooBig) ? d.tooBig : [] };
  } catch (e) { return null; }
}

// 写完读回比对，写不进本地存储时返回 false（这样的浏览器不开通云存档，§15）
export function writeCloud(s: CloudLocalState | null): boolean {
  try {
    if (!s) { localStorage.removeItem(CLOUD_KEY); return true; }
    const j = JSON.stringify(s); localStorage.setItem(CLOUD_KEY, j);
    return localStorage.getItem(CLOUD_KEY) === j;
  } catch (e) { return false; }
}

// 开通、同步、恢复与撤销共用 Web Locks 的 shoota-cloud 锁（§16）。wait 为假时拿不到锁就跳过，返回 undefined。
// 不支持 Web Locks（含 http 页面）时直接执行，靠服务端条件更新兜底
export async function withCloudLock<T>(wait: boolean, fn: () => Promise<T>): Promise<T | undefined> {
  const locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return fn();
  return locks.request('shoota-cloud', wait ? {} : { ifAvailable:true }, lock => lock ? fn() : undefined);
}

// 存档写入、退出游戏、撤销后请求一次同步；cloud.ts 启动时接上
let kick = () => {};
export const onSyncRequest = (fn: () => void) => { kick = fn; };
export const requestSync = () => kick();
