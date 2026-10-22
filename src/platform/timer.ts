// 页面在后台时暂停的计时：启动各段超时只算前台的时间，回到前台接着计（docs/DESIGN.md §15 启动各段超时的计法）。
// 返回停止函数；到时只调一次 fire。没有 document 的环境（单测）当作一直在前台。
export function visibleTimeout(ms: number, fire: () => void): () => void {
  const doc = typeof document === 'undefined' ? null : document;
  let left = ms, since = 0, t: ReturnType<typeof setTimeout> | undefined;
  const run = () => { since = Date.now(); t = setTimeout(done, left); };
  const onVis = () => {
    if (doc!.hidden) { if (t !== undefined) { clearTimeout(t); t = undefined; left -= Date.now() - since; } }
    else if (t === undefined) run();
  };
  const stop = () => { clearTimeout(t); t = undefined; doc?.removeEventListener('visibilitychange', onVis); };
  function done(){ stop(); fire(); }
  doc?.addEventListener('visibilitychange', onVis);
  if (!doc?.hidden) run();
  return stop;
}
