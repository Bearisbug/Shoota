// 游戏页文案：已有的从 src/app/copy.ts 的 player 与 launch 两组取，这里只放那里还没有的。

export { copy } from '../copy';

export const extra = {
  failTitle: '没能打开游戏',
  close: '关闭',
  exitFullscreen: '退出全屏',
  sessionTitle: '本次时长',
  saveTitle: '存档',
  cloudTitle: '云存档',
  preferPortrait: '这款游戏竖屏玩更舒服',
  preferLandscape: '这款游戏横屏玩更舒服',
  cloudOff: '只存在这台设备',
  cloudSynced: (hhmm: string) => `已同步 · ${hhmm}`,
  cloudPending: '等待同步',
  cloudOffline: '离线，联网后同步',
  cloudStopped: '云存档暂时不可用',
  // iPhone：添加到主屏幕（§13 全屏与引导）。主屏幕上的 shoota 与 Safari 存储分开，先给恢复码
  installTitle: '添加到主屏幕，全屏玩',
  installCodeLead: '先记下恢复码。从主屏幕打开的 shoota 读不到 Safari 里的存档，到存档页输入恢复码就能接着玩。',
  installNoCode: '这台设备的进度还没有上云。添加前先到存档页复制存档码，从主屏幕打开后再恢复。',
  installSteps: [
    '点 Safari 的「分享」按钮（iOS 26 先点底部的「···」）',
    '选「添加到主屏幕」',
    '保持「作为网页 App 打开」开着，点「添加」',
    '从主屏幕上的 shoota 图标打开，游戏会铺满整块屏幕',
  ],
  copyCode: '复制恢复码',
  codeCopied: '已复制恢复码',
  copyFailed: '没能复制，请手动记下',
  // 微信：在浏览器打开（§13 全屏与引导）
  wechatTitle: '在浏览器打开，可全屏、可横屏',
  wechatStepIos: '点右上角「···」，选「在 Safari 中打开」',
  wechatStepAndroid: '点右上角「···」，选「在浏览器打开」',
  wechatCodeLead: '微信和浏览器的存档互不相通，到浏览器的存档页输入恢复码就能接着玩。',
  gotIt: '知道了',
} as const;
