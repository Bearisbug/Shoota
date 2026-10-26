# 经营提醒与提速冻结版 · 040d2ac 平台上线前验收

RUN-PLATFORM-20261026-D6，2026-10-26。执行 web-game-responsive 上线验收模式，加载 ui-constraints、project-workflow。纯验收，无游戏源码、HTML/ZIP、平台文件修改，无部署。本项目原有 README / 冻结交付记录 / evidence 验收台账继续使用；不改平台 docs，不扩展为视觉或玩法重构。

## 版本与环境

- 版本：`2026-10-26-d6df70d39527`；完整HTML：本冻结目录 `云际航空.html`。
- HTML SHA256：`d6df70d3952729d116ab03dd6abb646d7dcae556f3a208ccf3ae0c501a411757`。
- ZIP SHA256：`20e186172ce433b67bb05cfeceed20d62378f368f8d048497a69dd7208e5f05c`。
- 源码：`source/dist`；构建：`source/build-local.py`。`source-files-manifest.json` SHA256 `434edb230d840f4c511a6f962eae07fed07dfbe11ff36f240e1faf3281a84127`，逐文件复核全部相同。
- 实际平台：`/Users/leizhang/Documents/shoota/tmp/wt-portrait/public`，提交 `040d2acb64887eeacba2b3c6463429666fd19921`；index SHA256 `227161a0488ed3c3fc5dca8e51c78ce0304e65667b11fc50e6919a16b9ab8e38`。
- 本轮 preview.py 只读原平台静态资源，在临时HTTP响应中更新航司资源大小、提供本冻结HTML；真实平台iframe srcdoc、postMessage与IndexedDB存档桥运行。仅监听127.0.0.1:8923，结束已关闭服务/测试页，恢复浏览器视口。
- 浏览器：桌面Codex IAB，具体版本未暴露。默认字号与缩放1。视口模拟不等同真实iOS/Android。
- 测试存档仅写独立localhost端口的 `changju/kv/local|airline-empire`。funded/world为旧修订2存档；new为隔离空存档；longnews是100架、100条航线的明确压力夹具，由实际 `rankCrossings` 生成878字排名消息。fixture未混入游戏HTML，不接触玩家正式存档。

## 有效旧证据的复用

仅复用**本d6df版本**在同一040d2ac平台下生成的 `../report.md`、`../layout-browser.json`、`../batch-browser.json`、`../browser-save.json`、`../close-preserves-messages.json` 及对应截图。游戏HTML与平台index指纹均匹配。本轮**没有使用57e5截图作为d6df验收证据**。57e5只提供已有隔离测试数据；机场数据逐字节相同，按要求不再遍历260页机场榜。

复用结果：排名突破→飞机交付→基地/联程/竞争动态→运行报告；四核心尺寸快进5周在W4剧情暂停、选择后自动W6；首条关闭只标记首条，其余交付/运行信息留存；七视口消息布局；160架样例推进；249项冻结源码测试，2/80/160架各15周完整状态与旧版相同。

## 七视口关键状态与四核心流程

本轮新拍总览、采购数量编辑、长剧情、经营汇总、俄罗斯目的地选择、航线报价：每种基础尺寸都有当前HTML实际截图。另有边界、复杂消息及实际操作截图，共74条测量记录，见 `layouts.json` / `layout-summary.json`。

| 外层尺寸 | iframe尺寸 | 新增关键状态检查 | 实际经营流程 |
| --- | --- | --- | --- |
|360×640|360×591|六类状态均通过|租2架C909并W6→W7；交付3架优先提醒；另成都CTU新局W1→W2|
|390×844|390×795|六类状态均通过|购买3架C909，双击仅一单；快进W1→W4剧情→W6；开VVO直飞并经OVB开DME|
|430×932|430×883|六类状态均通过|主操作与草稿抽查|
|844×390|844×340|六类状态均通过，长内容局部滚动|购买2架3年二手C909，W7→W8剧情末项，随后显示4架交付；跨国经停开通并结算|
|768×1024|768×974|六类状态均通过|主操作与草稿抽查|
|1366×768|1366×718|六类状态均通过|购买4架E190-E2，回车提交一次，W8→W9，运行清单汇总W6–W8；退出刷新保持资产|
|1440×900|1440×850|六类状态均通过|主操作与草稿抽查|

74条记录未见根级或模态横向溢出；测量的提交/经营操作均在视口内。默认尺寸的采购数量、航线班次与主操作无需滚动整页。长剧情、报价明细及压力消息采用有边界的模态正文滚动，标题/关闭/底部操作可达；不能描述为所有长内容一屏读完。

补充尺寸：320×568、390×600，以及599/600/601、699/700/701、959/960/961宽度、844×549/550/551高度。新开局长中英文名称、四川/CTU选择保留，最终360×640提交并经营成功。压缩尺寸不是软键盘或200%文字测试。

## 功能结果与证据

| 用例 | 观察结果 | 证据 |
| --- | --- | --- |
| 采购数量校验 | 0数量与1000架余额不足均禁用提交；改3恢复 | 采购七视口截图，实际按钮状态读取 |
| 双击防重复 | 3架C909只支付630百万元，现金10000→9370 | `purchase-save.json`，W1采购操作记录 |
| 租赁/二手/全新 | 2架租赁（天桥）、2架3年二手、4架E190-E2键盘提交均准确 | `360-lease.jpg`、`844-used-purchase.jpg`、`1366-keyboard-purchase.jpg` |
| 真实交付优先级 | W7显示3架新机交付；W8处理剧情后先显示4架（租赁+二手）交付，关闭不会丢掉运行报告 | `360-real-delivery-first.jpg`、`844-delivery-after-choice.jpg` |
| 跨周消息保留 | W9运行清单含W6–W8的两条航线，延误与改签人数保留；已显示的交付不重复 | `1366-multiweek-operations.jpg`、`purchase-save.json` advicePresented |
| 保存/退出/刷新 | W9，13架总机队，9架交付、4架待交付，现金8023.150640269825百万元 | `purchase-save.json`、`1366-reloaded-purchase.jpg` |
| 俄罗斯机场 | 51个；SVO/DME/VKO/ZIA中文机场名不同且可选 | `russia-options.json`，七尺寸route-selection截图 |
| VVO直飞 | HGH→VVO 1794km，每周3往返，500万元；旋转及前后步骤保留班次，双击只新增一次 | 七尺寸route-quote截图、`world-save.json` |
| DME经停 | HGH→OVB→DME，4059/2787km，两段均在航程内；90分钟经停，每周1往返，700万元 | `844-stopover.jpg`、`world-save.json` |
| 联动排班回归 | VVO航线执行联动自动排班，仍为3往返、同一飞机、autoSpacing=60，周次未增加 | `390-vvo-timetable.jpg`、`world-save.json` |
| 时区 | HGH 07:00起飞、VVO当地12:00抵达；按3小时飞行与2小时时差显示 | `390-vvo-timetable.jpg` |
| 新航线结算/刷新 | W2，4条航线含VVO及经OVB的DME，现金9991.213543666667百万元，刷新保留 | `world-save.json`、`390-reloaded-routes.jpg` |
| 俄罗斯市场分页 | 13页、51机场；末页KHV/BQS/VVO，下一页禁用；VVO显示管理现有航线和自家运力1080 | `russia-market-pages.json`、`390-russia-market-last.jpg` |
| 新局 | 名称蓝天梦想Skybound成都航空，四川→成都双流CTU，2000万元+2架自有新机；推进到W2 | `new-game-save.json`、`360-new-game-settled.jpg` |
| 超长排名 | 实际排名算法生成从152升至1的878字标题，仍可下一条、关闭、查看详情；键盘End滚到正文末尾，scrollTop1715.5、clientHeight421、scrollHeight2136 | `360-long-ranking.jpg`、`360-long-ranking-bottom.jpg`、`long-message-scroll.json` |
| 大量运行清单 | 100条航线合并成1条消息，实际点击50页读完100条，末页下一页禁用；关闭回W2，无额外结算 | `operation-pages.json`、`360-operation-last.jpg`、`844-operation-last.jpg` |
| 控制台 | 未捕获error/warn | `browser-errors.json` |

测试中一次“继续游戏”链接后立刻刷新发生导航时序竞态，落回夹具页；改为明确进入平台、等待经营按钮可见后刷新，恢复正常。滚轮控制工具未推动长消息，改用真实键盘PageDown/End验证实际正文滚动，未用脚本修改scrollTop冒充交互。以上工具路径未计为产品缺陷。

## 边界、已知事项与结论

- 本轮没有发现需要修复的核心阻塞缺陷，未改任何游戏成品，**不需要重新冻结**。源码、HTML、ZIP、机场数据、平台指纹均复核，见 `integrity.json`。
- 249项冻结源码自动测试结果来自同一指纹的 `../frozen-tests.txt`，本轮源码零变化，复用有效；不虚报重复执行。
- 原57e5验收记录过“机场榜空搜索文案不准确”“机场详情返回重置第一页”两项非阻塞体验问题。本轮未修改相关行为，也未重新遍历全部机场榜，不把这些已知项标记已修复。
- 真机iOS Safari/Android Chrome、触屏滚动、系统软键盘、地址栏伸缩、安全区、200%文字及系统reduced-motion仍无对应环境证据，**待验收**。默认字号的窗口覆盖不能替代这些项。
- ui-constraints全路由滚动条样式/槽位、所有像素对齐与四类裁切探针未做全量静态审计；本轮关键流程通过真实截图、交互、尺寸和业务状态核对。平台无主题切换，暗色切换不适用。游戏为回合经营，实时比赛暂停不适用，快进暂停/恢复已覆盖。
- 服务与浏览器测试页已关闭，视口恢复。正式站/测试站上传由发布统筹执行；本轮没有发布或修改平台docs。

**结论：d6df70d39527在040d2ac实际平台容器、桌面IAB的七视口关键状态与四核心经营流程通过；消息优先级、跨周合并、连续经营、旧档、新局、采购及新增机场开航回归通过。完整全环境适配仍有上述真机与辅助功能待验收项，不宣称全部移动设备通过。**
