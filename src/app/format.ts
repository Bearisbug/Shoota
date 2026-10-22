// 时长、多久前、文件大小三种格式，逐条沿用旧版 fmtPlay / fmtWhen / fmtSize（dd731d6 public/index.html）。

export const fmtSize = (b: number) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

export function fmtPlay(sec: number | undefined) {
  if (!sec) return '还没玩过';
  const m = Math.round(sec / 60);
  if (m < 1) return '不到 1 分钟';
  if (m < 60) return m + ' 分钟';
  return (sec / 3600).toFixed(1) + ' 小时';
}

export function fmtWhen(ts: number | undefined, now = Date.now()) {
  if (!ts) return '—';
  const diff = now - ts;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

// 存档码确认说明里的导出时间，如「10月21日 21:05」
export const fmtExportTime = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 下载存档文件名里的日期，YYYY-MM-DD（本地时区）
export const fmtFileDay = (d = new Date()) => d.toLocaleDateString('sv');

// 撤销槽的替换日期，如「10月21日」
export const fmtDay = (ts: number) => new Date(ts).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
