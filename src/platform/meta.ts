// 平台元数据 changju.meta.v1（docs/DESIGN.md §9）：localStorage 一个键，读时浅合并，未知字段（含不读写的 sendLog）原样保留，写时整份覆盖。
// 行为逐条沿用旧版 public/index.html（dd731d6）的 blank、persist、me、peek、stat、hashId、ensurePlayer。
import { LOCAL_PLAYER, META_KEY, type GameStat, type MetaV1, type PlayUser } from '../shared';

const blank = (): MetaV1 => ({ session:null, users:{}, stats:{}, wish:{}, achDefs:{}, sendLog:{} });
let m: MetaV1 | null = null;
let had = false; // 打开页面前本机已有平台数据

// 第一次用到时才读，搬家检查跳走的页面不碰存储
export function meta(): MetaV1 {
  if (m) return m;
  let d = blank();
  try { const s = localStorage.getItem(META_KEY); if (s) { had = true; d = Object.assign(blank(), JSON.parse(s)); } } catch (e) {}
  return m = d;
}
export const hadMeta = () => (meta(), had);
export function persist(){ try { localStorage.setItem(META_KEY, JSON.stringify(meta())); } catch (e) {} }

/* ───────── 本机玩家：没有注册，旧版留下的 session.email 照用，存档键与统计都按它分 ───────── */
export function me(){ const d = meta(), s = d.session; return s && d.users[s.email] ? { email:s.email, ...d.users[s.email] } : null; }
export const player = () => me()?.email ?? LOCAL_PLAYER;
export function ensurePlayer(){
  const d = meta();
  if (d.session && d.users[d.session.email]) return;
  d.users.local ??= { nickname:'玩家', created:Date.now() };
  d.session = { email:'local', at:Date.now() }; persist();
}
export function peek(gid: string, email = me()?.email): GameStat | null { const d = meta(); return email && d.stats[email] && d.stats[email][gid] || null; }
export function stat(gid: string): GameStat | null {
  const e = me()?.email; if (!e) return null;
  const d = meta(); d.stats[e] ??= {};
  return d.stats[e][gid] ??= { seconds:0, last:0, ach:{}, status:'' };
}
export function hashId(s: string){ let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619); } return 'u' + (h >>> 0).toString(16); }
// 注入给游戏的玩家：id 是本机玩家名的摘要，现有玩家都是 u9c436708
export function playUser(): PlayUser { const u = me(); return { id:hashId(u?.email ?? LOCAL_PLAYER), nickname:u?.nickname ?? '玩家' }; }
export const wishList = () => meta().wish[player()] || [];
// 愿望单切换：返回切换后是否在单里（旧版 data-act="wish"）
export function toggleWish(gid: string): boolean {
  const list = meta().wish[player()] ??= [], i = list.indexOf(gid);
  if (i >= 0) list.splice(i, 1); else list.push(gid);
  persist();
  return i < 0;
}
