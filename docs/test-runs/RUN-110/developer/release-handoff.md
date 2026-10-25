# 简明结算与改版存档保护 · 交付记录

日期：2026-10-25。范围仅限本轮结算呈现及存档兼容；未部署测试站或正式站。

## 修改
- 一份结算简报显示利润、现金、客流、口碑；明细单独切换。交付和经营提醒按条合并，无需已读确认。
- 连续模拟保留必要剧情选择，选择后继续剩余周数。日常交付不另开阻断弹窗。
- 固定原存储标识、增加独立存档修订号。旧字段补全、改版前原档备份、滚动备份及恢复入口。
- 读档失败不自动新开局、不写入覆盖。导入先验证；损坏和高版本存档保护；恢复时保留被替换原始内容。

## 源码与成品
源码：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/dist/（新增 save.js，修改 app.js、engine.js、index.html、style.css）；构建：airline-empire/build-local.py；说明：airline-empire/README.txt。
HTML：/Users/leizhang/Documents/ChatGPT/shoota/云际航空.html
SHA-256：1f9b6fda6740b78cedecd3ce57c504b54d0d77e1ffc619fdab45c3beaf1adac5
ZIP：/Users/leizhang/Documents/ChatGPT/shoota/云际航空-离线版.zip
SHA-256：fceb6f8075093c4c560d14f4aa200d6ee71882293c955f13aa8afe921a1f3305
ZIP 内 HTML 与根目录 HTML 逐字节一致。

## 验证
自动测试 169 项通过、0 失败，结果见 tests.txt。新增 11 项存档测试覆盖三份实际历史导出、迁移幂等、核心资产保留、精确原档备份、坏档/未来档保护、导入、恢复、存储满/不可用、连续模拟恢复不重复结算。

真实浏览器为 Codex IAB 桌面内核，本地隔离端口 8899，未触碰玩家正式站或 file:// 原档。使用 fixture.html 中的明确测试夹具。
- 390×844：历史 W18 存档继续经营至 W19，刷新仍为 W19，恢复到 W18；现金、负债、2 架飞机及2条航线保留。见 legacy-backup-inspection.txt、390-legacy-resumed.png、390-restore-preview.png。
- 360×640：损坏主档显示中文恢复页；恢复有效备份后可经营；损坏原始字节仍保留。见 360-recovery.png、corrupt-recovery-inspection.txt。
- 360×640：2 架交付合并进简报，翻到第二条不另开自动顾问；主操作可见。见 360-delivery-summary.png。
- 连续模拟 5 周：第1周遇城市合作事件暂停；选择后自动继续到 5/5、W08，无需再点击继续；最终待决策事件仍显示，未代选。
- 844×390：简报及明细可切换，底部操作固定可见；高度不足时仅正文局部滚动。见 844-batch-summary.png、844-batch-details.png。
- 390×844、430×932、768×1024、1366×768、1440×900、320×568、390×600：简报抽查无横向页面溢出，底部主操作在视口内。见 viewport-checks.json 与对应截图。
- 1366×768：高修订号存档显示保护页，未开新局。见 1366-newer-save-protected.png。
- 浏览器错误/警告日志为空，见 browser-log.json。

早期 390 旧档截图是在最后一处仅调整损坏 JSON 中文报错前拍摄；正常旧档和结算代码与最终产物一致。360 恢复、交付、批量、横屏与矩阵截图均来自最终构建。

## 兼容边界及未验证项
存储标识仍为 skybound-save-v1，导出 version:1，新增 saveRevision:2。已测试当前仓库提供的三份历史导出，不承诺任意损坏或未知格式能自动修复。本版遇到比自身更高的修订号会拒绝覆盖；早期未实现此保护的旧游戏不可用于打开升级后的进度。
同站点、同浏览器且平台同账号/游戏标识可接续；跨浏览器、设备、站点或在线离线切换需导出再导入，不是云同步。平台源码检查显示以账号+游戏 ID 隔离，非游戏版本；本轮没有验证线上实际宿主存储。
未验证：真实 iOS Safari/Android Chrome、系统软键盘和 200% 文本缩放、浏览器原生文件选择器导入、部署后平台回归。导入逻辑通过自动测试，实际浏览器完成备份恢复。此为受影响流程开发验证，不宣称完整上线适配验收通过。
发布统筹上线前应在实际测试站用旧档完成载入→经营→保存→刷新；保持游戏 ID airline-empire 和存储标识不变，再发布同一验收产物。
