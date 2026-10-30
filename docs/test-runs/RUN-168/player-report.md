# LOL 选手生涯 v1.5.1：按 LOL 经理统一能力与潜力

2026-10-30。本次仅交付本地构建，未发布、未改写 LOL 经理源码或旧冻结版本。

## 最终口径

用户最新要求是完全参考 LOL 经理的能力与潜力设置。本次以其实际游戏文件为权威，撤回未交付的“POT90+最多20人”实现。经理规则明确是：**所有在役 NPC（战队＋自由市场）当前 OVR≥90 最多20人；POT不受20人名额限制**。非 Faker 普通选手 OVR/POT 最高98，真实 Faker 最高99。选手版把经理的用户传奇豁免改为实际自创选手 ID 豁免；自创玩家仍初始 POT98，机遇可至100，冒名或虚拟 NPC 没有豁免。

来源：`/Users/leizhang/Documents/ChatGPT/shoota/lol-manager/public/games/lol.html`

来源 SHA-256：`a6ebc4b084a4ef9790a4ab81eb7fa22070263dbb135c64ec9979803b31a81e04`

`sync-manager-ratings.cjs` 只读运行经理引擎，提取2014–2027各开局实际真实选手的OVR、POT、六维及真实储备选手定义，冻结为本项目 `assets/history/manager-ratings.json`。离线游戏不依赖隔壁目录，只有主动更新参考快照才需要经理源码。源文件指纹校验防止把旧参考误称当前经理版本。

新开局数值例（2017，OVR/POT）：Faker97/99，Rookie94/98，Spirit83/94，Koro1 82/92，Mata84/97，DanDy72/96。与经理版相同；它们取代 v1.5.0 的独立评级。开局选择页也使用同步后的年度OVR，避免签约前后显示两套初值。

保留用户先前要求的选手生涯成长减速、16岁入市、选手视角和同页5场模拟。此次同步能力／潜力与虚拟新秀潜力分布，不回退已修好的生涯交互，也不重新引入旧版快速成长。

## 修改与产物

- 源码目录：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/src/`
- 主要修改：`eras.js` 经理数值匹配、储备初值、旧档迁移与全市场能力上限；`career.js` 新建／推进／保存入口；`engine.js` 新人潜力分布与生成入口；`history-data.js` 生成快照。
- 数据与脚本：`assets/history/manager-ratings.json`、`scripts/sync-manager-ratings.cjs`、`scripts/build-history.py`。
- 完整构建：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/dist/lol-player.html`
- 同字节入口：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/dist/index.html`
- 版本：1.5.1；大小：5,563,367 字节。
- 构建 SHA-256：`eedf3d2b8620069e2721f12aae7285a74cf88cb7748168194cede07fd76c2122`
- 重建：`python3 scripts/build-history.py`，再 `python3 scripts/build.py`。主动同步经理时先执行 `node scripts/sync-manager-ratings.cjs`。
- 用户本地预览：`http://127.0.0.1:8776/`。恢复了中断后停止的本地服务，未导入测试存档到用户来源。

## 兼容策略

按来源指纹＋快照结构版本做一次性迁移。真实选手的初值、潜力参照经理；已有成长按初值差额保留到合法上限，超出个人潜力／99身份限制／全市场20人能力名额时实际回调六维与OVR，并记录修正，不只改显示。潜力不再被旧能力99无条件顶回99。找不到经理同身份同位置者不套用同名名将数据。

保留玩家本人能力、玩家POT98→100机遇、合同金额与年限、赛果、已取得荣誉和正在进行中的比赛快照。已开始的单局沿用其旧能力快照至结束，下一局使用更新后的世界数值。历史战绩不回算。修改后连续读取／保存幂等。

## 自动验收

- `scripts/manager-ratings.cjs`：14个开局，**6,096条选手—赛季匹配项的OVR、POT和全部六维逐项相等**，并校验经理源码指纹、OVR20人限制、仅Faker99及玩家例外。报告 `output/market-cap-v1.5.1/manager-alignment.json`。
- `scripts/market-cap.cjs`：复现全市场膨胀99的旧档，验证实际回调、玩家97保留、合同／历史／LIVE不变、重复读取稳定；500名新秀、5次年份切换、完整2017赛年38轮及跨季；关闭实际限制函数后构造35名96能力NPC，断言确实失败。最终通过记录 `output/market-cap-v1.5.1/final-tests.log`、`results.json`。
- `scripts/inline-match.cjs`：同页推进、手动中途续算、五场精确结算、重复点击、合同停止、季末不足五场回执均通过。
- `scripts/selection.cjs`：五位置首发评估通过。
- `scripts/player-perspective.cjs`：五位置个人决策、POT98→100、训练与重复结算、保存恢复、比赛中教练战术值不影响结果均通过。测试中的人工造数先走真实保存入口执行上限，再验证往返一致。

较早 `output/market-cap-test.log` 含并行中间测试留下的混合内容，不作为最终通过依据；以独立 `final-tests.log` 和最终 JSON 为准。

## 真实浏览器证据

独立 IAB QA 标签使用 `http://127.0.0.1:8808/#play-lol-player` 的平台 iframe；通过可见“复制／恢复存档文本”界面导入测试档。未读写浏览器隐藏状态，未动用户8776存档。

最终构建证据目录：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/output/market-cap-v1.5.1/browser/`

- `manager-aligned-2017.png`：桌面1280×720真实选手库，Faker97/99、Rookie94/98等。
- `legacy-corrected-final.png`、`old-save-counts.json`：旧档导入后，从可见导出文本统计全部NPC，OVR90+恰好20，OVR99/POT99均只有Faker，自创玩家OVR97保留。POT90+为76，符合经理“不限制潜力人数”的规则。
- `five-390x844.png`：手机390×844实际快速模拟五轮完成5/5；根宽390、scrollWidth390；刷新后仍显示5/5汇总。
- 最终浏览器console warning/error为空。未把前序构建截图当最终证据。

本轮纯数值／数据接入，没有布局改动，未重做完整上线适配验收；实体手机、软键盘、200%缩放、生产缓存仍未验证。

## 数据边界

6,096为“选手—赛季”记录数，不是不同选手人数。另有187条跨年记录在经理当前阵容与储备库都没有可靠的同身份同位置匹配，主要是同名人物或不同位置记录；保留身份，使用保守低值，不凭名称强行套用著名选手。这些不计入逐项相等通过数。生涯赛果会使后续成长不同，因此旧档当前能力不要求等于经理新开局初值。

此前记录的历史BP偶发使用尚未发布英雄仍未在本轮修复。未宣称所有历史细节完全一致。
