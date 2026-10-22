// 平台界面文案，集中在这一处（docs/DESIGN.md §13 平台页面断点）。
// 标「旧版」的逐字沿用 dd731d6 的 public/index.html，改动前先对 §41 对齐对照；其余是这轮新增的云存档、游戏页与引导文案。
// 游戏页（src/app/player/ 的运行层与 src/app/player-ui/ 的界面）同样从这里取字。

import type { LaunchFailReason } from '../shared';

const book = (title: string) => `《${title}》`;
const clock = (t: Date) => `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
const SAVE_UNREADABLE = '这台设备的存档读不出来，刷新页面后再试，存档不会丢';
const TOO_BIG = '这款游戏的存档太大，只存在这台设备上'; // FLOW-CLOUD-FIRST S3

export const copy = {
  pageTitle: 'shoota 游戏平台', // 与 index.html 的 <title> 相同，部署后的健康检查按这个标题认页面

  nav: {
    label: '主导航',
    store: '商店',
    library: '游戏库',
    backup: '存档',
    home: 'shoota 首页',
    brand: 'shoota',
  },

  // 旧版
  status: { ok: '可玩', dev: '开发中 · 可玩' },

  search: {
    label: '搜索游戏', // 旧版：搜索框的可读名
    placeholder: '搜索游戏、类型', // 旧版
  },

  store: {
    title: '商店',
    featuredLabel: '精选', // 以下旧版：精选区的可读名
    featured: '精选与推荐',
    featuredCount: (n: number) => `${n} 款游戏`,
    play: '开始游戏',
    details: '查看详情',
    continue: '继续游玩',
    all: '全部游戏',
    searching: (q: string) => `搜索「${q}」`,
    count: (n: number) => `${n} 款`,
    played: (t: string) => ` · 已玩 ${t}`, // 旧版：全部游戏卡片类型后的已玩时长
    allGenres: '全部',
    genreFilter: '按类型筛选',
    empty: '没有找到匹配的游戏。',
    clear: '清除筛选',
    bandTitle: '进度只存在这台设备上',
    bandText: '不用注册，存档自动保存在这个浏览器里。换手机、换浏览器或清理缓存前，先复制一份存档码，到新设备上粘贴回来就能接着玩。',
    bandAction: '备份 / 恢复进度',
    // 开通云存档后的底部说明带（§13 云存档文案）
    bandTitleCloud: '进度自动存到云端',
    bandTextCloud: '换手机或换浏览器时在存档页输入恢复码就能接着玩。',
  },

  game: {
    notFound: '找不到这款游戏，它可能已从这台设备移除。', // 以下旧版
    backToStore: '回到商店',
    crumbs: '位置',
    facts: { genre: '类型', session: '一局', saves: '存档', size: '大小' },
    startTitle: (title: string) => `开始玩${book(title)}`,
    startPlayed: (play: string, when: string) => `你已玩 ${play}，上次 ${when}。存档会接着上次。`,
    startNew: '点开就能玩，存档自动保存。',
    resume: '继续游戏',
    start: '开始游戏',
    about: '关于这款游戏',
    loop: '一局怎么玩',
    identities: '十个出身',
    identityCols: ['身份', '默认名', '武魂', '改命高光'] as const,
    perks: '金手指 · 开局三选一',
    record: '你的记录',
    playTime: '游玩时间',
    lastPlayed: '上次游玩',
    progress: '进度',
    wishAdd: '加入愿望单',
    wishIn: '已在愿望单',
    wishAdded: '已加入愿望单',
    wishRemoved: '已移出愿望单',
    achievements: '成就',
    unlocked: '已解锁',
    noAchievements: ['这款游戏还没接入平台成就。游戏调用 ', 'Platform.unlock()', ' 后，成就会出现在这里。'] as const,
    notes: '说明',
  },

  library: {
    emptyTitle: '游戏库还是空的', // 以下旧版
    emptyText: '玩过或加入愿望单的游戏会出现在这里。',
    emptyAction: '去商店挑一款',
    title: '我的游戏库',
    count: (n: number, total: string | null) => `${n} 款${total ? ' · 共 ' + total : ''}`,
    wished: '愿望单',
    neverPlayed: '还没玩过',
    resume: '继续游戏',
    start: '开始游戏',
    playTime: '游玩时间',
    lastPlayed: '上次游玩',
    achievements: '成就',
    progress: '进度',
    storePage: '商店页面',
    aboutSaves: '关于存档',
    aboutText: (title: string) => [`${book(title)}的存档自动保存在这台设备的浏览器里，下次打开接着玩。换浏览器或清除网站数据后进度会丢失，`, '先复制一份存档码', '，到新设备上粘贴就能恢复。'] as const,
    // 开通云存档后（§13 云存档文案），中间一段链到存档页
    aboutTextCloud: (title: string) => [`${book(title)}的存档保存在这台设备并同步到云端，换设备时`, '输入恢复码', '就能接着玩。'] as const,
    listLabel: '我的游戏',
    // 撤销槽（FLOW-CLOUD-CONFLICT S4）
    undoBadge: '可撤销',
    undoConflict: (when: string) => `这款游戏的存档在 ${when} 换成了另一台设备上玩得更久的进度。`,
    undoRecover: (when: string) => `这款游戏的存档在 ${when} 取回云存档时换成了云端的进度。`,
    undoAction: '换回原来的进度',
    undoDone: '已换回原来的进度',
    undoFailed: '没能换回原来的进度，请稍后再试。',
  },

  backup: {
    title: '备份 / 恢复进度', // 以下旧版
    intro: '不用注册账号，进度保存在这台设备的浏览器里。换手机、换浏览器或清理缓存都会丢失进度，提前复制一份存档码存好。',
    introCloud: '进度自动同步到云端，记下恢复码，换手机、换浏览器或清理缓存后都能找回。', // §13 云存档文案
    packTitle: '备份这台设备的进度',
    packing: '正在整理这台设备的进度…',
    packFailed: SAVE_UNREADABLE, // 打包时存档库读不出，不给存档码
    codeLabel: '存档码',
    copy: '复制存档码',
    download: '下载存档文件',
    codeNote: (chars: string) => `存档码共 ${chars} 个字符，只包含游戏进度。可以发到微信「文件传输助手」，或存进备忘录。`,
    noProgress: '这台设备上还没有游戏进度。玩过之后，再回来复制存档码。',
    noProgressAction: '去商店挑一款',
    copied: '存档码已复制。发到微信「文件传输助手」或存进备忘录。',
    copyFailed: '没能自动复制。长按上面的存档码，全选后复制。',
    fileName: (day: string) => `shoota-存档-${day}.txt`,
    restoreTitle: '在这台设备上恢复进度',
    restoreText: '粘贴在另一台设备上复制的存档码，或者选择下载的存档文件（.txt）。',
    placeholder: '粘贴存档码，以 CJ 开头',
    restore: '恢复进度',
    confirm: '确认恢复',
    pickFile: '选择存档文件',
    cancel: '取消',
    askExport: (when: string, titles: string) => `这份存档码导出于 ${when}，包含${titles}的进度。`,
    askOverwrite: (titles: string) => `恢复后，这台设备上${titles}现在的进度会被替换，替换后找不回来。`,
    restored: (n: number) => `已恢复 ${n} 款游戏的进度`,
    errEmpty: '先粘贴存档码，或者点「选择存档文件」。',
    errOld: '这个浏览器版本太旧，读不了这份存档码。换系统自带的浏览器，或者升级系统后再试。',
    errBad: '这段存档码读不出来，可能复制时漏了开头或结尾。回到原设备点「复制存档码」，整段重新复制一次。',
    errNone: '这份存档码里没有本平台游戏的进度。',
    errFile: '读不了这个文件。请重新选择下载的存档文件，或者直接粘贴存档码。',
    errWrite: '这台设备的存储写不进去，没能恢复。清理一些空间后再试。', // 存档库写不进，本机不变
    titles: (titles: string[]) => titles.map(book).join(''),
  },

  // 云存档卡（§13 存档页）与商店顶部的开通提示（FLOW-CLOUD-FIRST S4）
  cloud: {
    cardTitle: '云存档',
    localOnly: '存档自动保存在这台设备', // 旧版账号菜单里的说明，移到存档页；没开通或暂停同步时用
    synced: '存档自动保存在这台设备并同步到云端', // 开通后在同步时
    notYet: '玩过之后会自动开通',
    codeLabel: '恢复码',
    copyCode: '复制恢复码',
    codeCopied: '恢复码已复制。存进备忘录，换设备时用得上。',
    copyFailed: '没能自动复制。长按恢复码，全选后复制。',
    lastSync: '上次同步',
    neverSynced: '还没同步',
    tooBig: TOO_BIG,
    stopped: '云存档暂停同步了：这台设备的云存档凭据不对。进度照常存在这台设备上。',
    enterCode: '在这台设备输入恢复码',
    noticeTitle: '进度已经存到云端',
    noticeText: '记下这个恢复码。换手机、换浏览器或清理缓存后，在存档页输入它就能接着玩。',
    noticeDismiss: '知道了',
    replaced: (titles: string) => `${titles}的存档换成了另一台设备上玩得更久的进度，可以在游戏库撤销。`,
    replacedAction: '去游戏库',
  },

  // 恢复确认 PAGE-RECOVER（FLOW-RECOVER）
  recover: {
    title: '用恢复码取回进度',
    intro: '输入在另一台设备上记下的恢复码，取回那份云存档里的全部进度。',
    fieldLabel: '恢复码',
    placeholder: 'XXXX-XXXX-XXXX-XXXX',
    lookup: '查找',
    looking: '正在查找…',
    errLength: '恢复码是 16 位，检查有没有漏输', // FLOW-RECOVER S1
    errUnknown: '没找到这个恢复码，核对后再试', // S2
    errNetwork: '网络不通，连上网再试', // S2
    errGone: '这个恢复码已经失效，云端没有这份存档了。', // S4 云端找不到
    errUnavailable: '云存档暂时不可用，稍后再试。', // S4 鉴权失败
    errStorage: '这台设备的存储写不进去，没能取回。清理一些空间后再试。', // S4 本机写不进
    sameCode: '这台设备已经在用这个恢复码，进度会自动同步。',
    confirmTitle: '确认取回',
    confirmIntro: (n: number) => `这份云存档里有 ${n} 款游戏的进度：`,
    confirmEmpty: '这份云存档里还没有游戏进度。确认后，这台设备的进度会存进这份云存档。',
    cloudSide: (play: string) => `云端 ${play}`,
    bothSides: (cloud: string, local: string) => `云端 ${cloud}，这台设备 ${local}`,
    keepLonger: '两边都有进度的游戏，会留下游玩时长更长的那份，另一份可以在游戏库撤销。',
    switchAccount: '确认后，这台设备改用这个恢复码，原来的恢复码不再同步这台设备的进度。',
    confirm: '确认取回',
    adopting: '正在取回…',
    back: '返回',
    cancel: '取消',
    done: (n: number) => `已取回 ${n} 款游戏的进度`,
  },

  // 游戏页（src/app/player/）用到的文字
  player: {
    exit: '退出游戏', // 旧版
    fullscreen: '全屏', // 旧版
    fullscreenDenied: '这个窗口不支持全屏。', // 旧版
    elapsed: (sec: number) => `本次 ${Math.floor(sec / 60)} 分钟`, // 旧版，每 5 秒刷新
    // 存档状态四种（REQ-011，旧版）
    savePending: '存档待写入',
    saveReading: '读取存档…',
    saveLoaded: '已读取存档',
    saveNew: '新存档',
    saved: (t: Date) => `已存档 ${clock(t)}`,
    achievement: (title: string) => `解锁成就 · ${title}`, // 旧版，第二行是成就名
    floatLabel: '游戏菜单',
    panelTitle: '游戏菜单',
    resetFloat: '恢复默认按钮位置',
    installGuide: '添加到主屏幕，全屏玩',
    wechatGuide: '在浏览器打开',
    rotateToLandscape: '横过手机玩更舒服',
    rotateToPortrait: '竖过手机玩更舒服',
    rotateWechat: '在微信的设置、通用里打开横屏模式',
    tooBig: TOO_BIG,
  },

  // 载入页与失败页（§13 载入页与失败页，FLOW-LAUNCH 分支）
  launch: {
    loading: '正在载入游戏…',
    retrying: '网络不太稳，正在重试…',
    retry: '重试',
    exit: '退出',
    fail: {
      'offline': '网络断开了，连上网再试',
      'net-error': '网络不太稳，游戏没下载完，可以重试',
      'net-timeout': '网络不太稳，游戏没下载完，可以重试',
      'net-stall': '网络不太稳，游戏没下载完，可以重试',
      'net-slow': '网络太慢，游戏两分钟还没下载完',
      'http-404': '游戏文件暂时取不到，稍后再试',
      'http-error': '游戏文件暂时取不到，稍后再试',
      'save-timeout': SAVE_UNREADABLE,
      'save-error': SAVE_UNREADABLE,
      'boot-timeout': '游戏没能启动，可以重试一次',
      'boot-error': '游戏没能启动，可以重试一次',
    } satisfies Record<LaunchFailReason, string>,
  },

  toastMs: { normal: 3600, achievement: 5200 }, // 旧版提示条时长
} as const;
