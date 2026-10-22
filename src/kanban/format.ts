// 看板的数字、时长、日期与地区名格式，逐条沿用旧版 src/kanban.html（docs/DESIGN.md §41「看板各面板、空态、格式」）

export const num = (n: number | null | undefined) => Number(n || 0).toLocaleString('zh-CN');

// 百分比四舍五入到整数，分母为 0 显示「—」
export const pct = (r: number, n: number) => (n ? Math.round((r / n) * 100) + '%' : '—');

// 启动面板的比例保留一位小数，整数时不带 .0：没回音的目标是 ≤ 0.5%，取整会全变成 0%
export const pct1 = (r: number, n: number) => (n ? +((r / n) * 100).toFixed(1) + '%' : '—');

export function dur(sec: number | null | undefined) {
  const s = Math.round(sec || 0);
  if (s < 60) return s + ' 秒';
  if (s < 3600) return Math.round(s / 60) + ' 分钟';
  return (s / 3600).toFixed(1) + ' 小时';
}

// 地区名按国内通行写法，其余用浏览器自带的中文短名
const REGION: Record<string, string> = { XX: '未知', CN: '中国大陆', HK: '中国香港', MO: '中国澳门', TW: '中国台湾' };
let names: Intl.DisplayNames | null | undefined;
export function regionName(code: string) {
  if (REGION[code]) return REGION[code];
  if (names === undefined) {
    try { names = new Intl.DisplayNames(['zh-CN'], { type: 'region', style: 'short' }); } catch { names = null; }
  }
  try { return names?.of(code) || code; } catch { return code; }
}

// 2026-10-21 → 10/21
export const md = (day: string) => day.slice(5).replace('-', '/');

// 「数据截至北京时间 YYYY-MM-DD HH:MM」里的时间，generatedAt 是 Unix 毫秒
export function bjStamp(ms: number) {
  const t = new Date(ms + 8 * 3600000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 16)}`;
}
