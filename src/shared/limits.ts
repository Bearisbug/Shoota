// 平台页面、游戏 SDK、Service Worker 与 Worker 共用的数值约定，出处见 docs/DESIGN.md §15 与 ADR-009。
// 改这里的数等于改契约：先改设计文档，再改这里。

// 启动一款游戏（FLOW-LAUNCH）的各段超时，单位毫秒；页面在后台时计时暂停
export const LAUNCH = {
  firstByteMs: 15_000, // 发出请求到收到第一个字节
  stallMs: 10_000, // 下载中途连续没有新字节
  totalMs: 120_000, // 整个下载
  idbOpenMs: 4_000, // 打开本机存档库
  idbReadMs: 4_000, // 读出这款游戏的存档
  readyMs: 15_000, // 游戏装进页面到发出就绪信号
  autoRetries: 1, // 网络、卡住、首字节与存档库失败自动重试的次数
} as const;

// 游玩中的存档与计时，沿用旧版数值
export const PLAY = {
  saveDebounceMs: 700, // 游戏连续写存档时合并成一次落盘
  tickMs: 5_000, // 游玩时长每 5 秒计一次
  playReportSec: 120, // 攒满 2 分钟上报一次时长
  suspendWaitMs: 500, // 退出前等游戏收尾的最长时间
  welcomeWaitMs: 1_000, // 改写游戏发出 hello 后等平台回 welcome，超时就提示从 shoota.ai 打开
  statusMaxChars: 60,
  achKeyMaxChars: 60,
  achNameMaxChars: 40,
  achDefsMax: 200,
} as const;

// 云存档（FLOW-CLOUD-FIRST、FLOW-CLOUD-SYNC、FLOW-CLOUD-CONFLICT、FLOW-RECOVER）
export const CLOUD = {
  gameMaxBytes: 1_048_576, // 一款游戏按上传编码后的正文上限，原文超过 gzipOverBytes 时按 gzip 后 base64 的长度算（RULE-CLOUD-002、INV-CLOUD-003）
  bodyMaxBytes: 2_097_152, // 一次同步请求正文上限
  pushMaxItems: 14, // 一次同步最多推几款游戏
  sameGameGapMs: 10_000, // 同一款游戏两次写入云端的最小间隔
  syncEveryMs: 60_000, // 平台页面开着时的同步间隔
  keepaliveMaxBytes: 60_000, // 页面隐藏时用 keepalive 补推的正文上限
  gzipOverBytes: 4_096, // 存档原文超过这个字节数时压缩后再上传
  expireDays: 365, // 云存档多少天没被同步过就删除
  undoKeepDays: 30, // 被替换的本机存档在撤销槽里保留几天
  expireBatch: 200, // 到期删除任务 cloud.expire 每次最多删几个云存档
} as const;

// 上报：启动遥测（API-LAUNCH-001）
export const TELEMETRY = {
  maxEvents: 10,
  maxBodyBytes: 4_096,
  readyBucketsMs: [1_000, 3_000, 10_000, 30_000], // 就绪耗时分桶上界，超过最后一档记入 bx
} as const;
