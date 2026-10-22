// 启动面板的口径与文案，口径见 docs/DESIGN.md §3：成功率 = 就绪 ÷ 开始，没回音 = 开始 − 就绪 − 失败 − 取消

import { TELEMETRY, type KanbanLaunch, type LaunchCounts, type LaunchFailReason, type RunEnv } from '../shared';

// 上报丢失时差额可能为负（开始那条没送到、就绪送到了），按 0 显示
export const noAnswer = (c: LaunchCounts) => Math.max(0, c.starts - c.ready - c.fail - c.cancel);

// 就绪耗时不超过 FAST_SEC 秒（第二档上界）的次数
export const fastReady = (c: LaunchCounts) => c.b1 + c.b3;

export const ENV_LABEL: Record<RunEnv, string> = {
  browser: '普通浏览器',
  wechat: '微信内置浏览器',
  standalone: '主屏幕应用',
};

// 类别对应 RB-LAUNCH-001 的处理方向：网络类调超时，存档类查存档库，文件与游戏类查游戏文件
export type ReasonKind = '网络' | '文件' | '存档' | '游戏';

export const REASONS: Record<LaunchFailReason, { label: string; kind: ReasonKind }> = {
  'offline': { label: '浏览器离线', kind: '网络' },
  'net-error': { label: '网络请求出错', kind: '网络' },
  'net-timeout': { label: '迟迟收不到首字节', kind: '网络' },
  'net-stall': { label: '网络中途卡住', kind: '网络' },
  'net-slow': { label: '下载超过两分钟', kind: '网络' },
  'http-404': { label: '游戏文件不存在', kind: '文件' },
  'http-error': { label: '服务器返回错误', kind: '文件' },
  'save-timeout': { label: '存档库超时', kind: '存档' },
  'save-error': { label: '存档库报错', kind: '存档' },
  'boot-timeout': { label: '游戏迟迟不就绪', kind: '游戏' },
  'boot-error': { label: '就绪前游戏报错', kind: '游戏' },
};

// 就绪耗时分桶，上界取 TELEMETRY.readyBucketsMs，字段名与 LaunchCounts 一致
type BucketKey = 'b1' | 'b3' | 'b10' | 'b30' | 'bx';
const [s1, s3, s10, s30] = TELEMETRY.readyBucketsMs.map(ms => ms / 1000);
export const FAST_SEC = s3;
export const BUCKETS: readonly { key: BucketKey; label: string }[] = [
  { key: 'b1', label: `≤ ${s1} 秒` },
  { key: 'b3', label: `${s1}–${s3} 秒` },
  { key: 'b10', label: `${s3}–${s10} 秒` },
  { key: 'b30', label: `${s10}–${s30} 秒` },
  { key: 'bx', label: `超过 ${s30} 秒` },
];

export interface ReasonGroup {
  reason: LaunchFailReason;
  label: string;
  kind: ReasonKind;
  n: number;
  places: { country: string; n: number }[]; // 次数从多到少
}

// 失败原因按原因合并各国家或地区，次数从多到少
export function groupReasons(rows: KanbanLaunch['reasons']): ReasonGroup[] {
  const by = new Map<LaunchFailReason, ReasonGroup>();
  for (const r of rows) {
    let g = by.get(r.reason);
    if (!g) by.set(r.reason, (g = { reason: r.reason, ...REASONS[r.reason], n: 0, places: [] }));
    g.n += r.n;
    g.places.push({ country: r.country, n: r.n });
  }
  const list = [...by.values()];
  for (const g of list) g.places.sort((a, b) => b.n - a.n);
  return list.sort((a, b) => b.n - a.n);
}
