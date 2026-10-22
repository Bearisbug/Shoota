// 平台启动（docs/DESIGN.md FLOW-SAVE-MOVE S3–S5、FLOW-COLLECT、FLOW-CLOUD-FIRST）。顺序沿用旧版 public/index.html（dd731d6）末尾的启动段：
// 建本机玩家 → 地址带 #move= 时导入搬家数据 → 领旅客编号 → 记一次访问；之后删过期撤销槽、开始云同步。
// 应用要等它返回 true 再按地址渲染页面（moveIn 会改写地址）；返回 false 时 head 里的搬家检查正在跳去搬家页，平台整体不启动。
import { track, ensureVid } from './collect';
import { startCloud } from './cloud';
import { ensurePlayer, hadMeta } from './meta';
import { moveIn } from './move';
import { pruneUndo } from './undo';

declare global {
  interface Window { __cjMoving?: boolean } // index.html 里 moveCheck 跳去搬家页前置为 true
}

export async function boot(): Promise<boolean> {
  if (window.__cjMoving) return false;
  ensurePlayer();
  const had = location.hash.startsWith('#move=') && await moveIn();
  ensureVid(hadMeta() || had);
  track({ t:'visit' });
  void pruneUndo().catch(() => {});
  startCloud();
  return true;
}
