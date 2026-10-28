# 航司与此生联合发布候选集成

2026-10-28。状态：隔离仓库中的集成候选已完成，本轮四项集成检查通过，未推送、未部署。发布统筹负责远端最新状态核对、测试站与正式站发布和线上浏览器验收。

## 基线与交付

仓库：`/Users/leizhang/Documents/ChatGPT/shoota/tmp/platform-save-reliability-20261028`。

本轮基线：`d14f12a0f7c5814aa05b85325d57893a61842989`，包含平台保存修复；其父基线为`776a5fe47ec7a186a1032e2eda04735bcb38210c`。新独立提交及补丁路径记在本仓库`output/save-qa/joint-delivery.json`。若统筹从776a5fe接入，必须先接入d14f12a，再接入本轮集成提交。

唯一生产变化如下。游戏文件均从冻结成品原样复制，未修改源码或修补构建HTML。

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| public/index.html | 126163 | d17c0d197eb925507118759164f819891a0e12688bc35c7f507efcca500abed0 |
| public/games/airline-empire.html | 1378006 | 16aaba838c19cfa1a7626397ed4e233e445a250e59cce65f285ecf26d9d6af7d |
| public/games/one-in-billions.html | 442420 | 03ead76cf58e97f195e80b5b67a46a99345b6b4d1ae1094a08b36922f90e26e1 |
| public/covers/one-in-billions.jpg | 334108 | b026d8acd7a8603f2c8e467eafcaf4cc52a7f288cff8d396881e42dfc259c2a0 |

此生来源：`/Users/leizhang/Documents/ChatGPT/shoota/one-in-billions/output/releases/2026-10-28-v1.3.2-03ead76cf58e/此生.html`。

航司来源：`/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-28-16aaba838c19/云际航空.html`。

封面来源：`/Users/leizhang/Documents/ChatGPT/shoota/output/releases/this-life-2026-10-27/one-in-billions.jpg`。

## 目录、范围与兼容

共19款，原18款相对顺序与所有目录字段保持，仅航司size更新；新此生位于一念长生之后、一克之差之前。名称“此生”，副标题“八十亿分之一”，简介采用217国家和地区、像素人生、成长抉择、留学与纪念册。不宣传联网社区或账号服务。全球高武不在目录中。

`audit.cjs`从基线提取目录逐条比较，并将目录整体剔除后比较宿主：目录之外完全相同。所有其他已跟踪游戏、封面、Worker和工作流逐字节比较一致。宿主保存桥、CJ0/CJ1、沙箱、加载及缓存实现保留d14f12a；未添加游戏侧ACK接口。

此生平台内JSON入口明确引导平台CJ1或独立版JSON，平台自动保存不变。开发记录确认schema1旧档可迁移，独立页使用IndexedDB；旧版软件不能自动读取新IndexedDB，需先导出JSON。航司保持version1/revision4，旧档直接读取；历史可靠性与旧飞机不强制恢复100%。完整兼容性结论以所引用的冻结交付为边界，不扩大到未测环境。

## 本轮真实执行：RUN-132

本地入口`http://127.0.0.1:8844`，脚本`preview.py`直接服务本仓库实际public文件，并支持无后缀游戏路由。统计POST返回204，无D1或云账户连接。使用全新端口的独立测试存档，无真实玩家数据。IAB桌面浏览器，默认字号，CSS视口模拟；浏览器精确引擎版本工具未提供。

- TC-JOINT-001：两款HTML、封面和ZIP内HTML一致；22个页面、61段脚本质量门通过；17项保存测试全部通过；目录和范围审计通过。见`manifest.json`、`zip-match.json`、`quality.txt`、`save-tests.txt`、`ui-scan.txt`。
- TC-JOINT-002：搜索“此生”得到唯一结果，标题、副标题、简介与封面正确。320×568、390×844、768×1024、1366×768实际尺寸的详情与游戏入口逐一检查；继续入口可点击，游戏库显示同名同封面。四尺寸根、裁切/滚动容器、正文文本行无横向溢出。见`search.txt`、`detail-*.png`、`life-entry-*.png`、`catalog-layout.json`、`detail-overflow.json`、`library.png`。320窄屏详情为正常纵向文档，开始按钮通过浏览器滚动后点击，不将详情页误报为游戏单屏决策。
- TC-JOINT-003：390×844新人生山姆，莫桑比克Maputo周边乡村，2026年出生。完成出生登记，0岁推进1岁后立即刷新，继续保留1岁/2027年及相同人物；退出重进也保留。游戏内“导入存档”明确显示平台暂不恢复JSON、原进度不变、请用平台CJ1。见`life-refresh.txt/png`、`life-reentry.txt`、`life-import-guidance.txt/png`。
- TC-JOINT-004：1366×768新建“联合发布验收1028”，杭州基地；经营一周后W02、2140万元。周报后刷新与退出重进均保留。再从游戏库回此生仍为山姆1岁，健康78、幸福56、知识1、关系74。见`airline-week2-before.txt`、`airline-refresh.txt`、`airline-reentry.txt/png`、`cross-game.txt`。

本轮四项通过；控制台最终warn/error列表为空（`browser-logs.json`）。截图已目视检查，实际尺寸见`screenshot-dimensions.json`。完整游戏规则测试未在本轮重复执行，不能把17项宿主测试说成航司308项或此生规则套件复跑。

## 开发证据复用与未验证项

读取并固定来源报告指纹于`developer-evidence.json`，不复制、覆盖其旧失败记录：

- 航司`airline-empire/output/host-d14f12a-qa/report.md`：同一16aaba游戏及原d14f12a宿主，七基础视口、附加边界、四尺寸完整循环、400机、旧档、CJ1及308项冻结测试通过。目录之外宿主与本候选一致。
- 此生冻结`qa/report.md`：同一03ead游戏、d14f12a隔离宿主，九实际尺寸、7.8MB/100人生独立JSON与平台CJ1、大档刷新重进、普通档立即刷新、故障保护通过。旧候选与最终截图范围按原报告区分。

这些是对应开发对话的验收证据，不冒称本轮全部重新执行。测试站、正式站、真机iOS/Android、真实软键盘与安全区、200%文字、file://离线打开、云账号与多设备同步仍未在本轮验证。平台游戏内JSON原子导入接口仍未实现，本次按明确CJ1指引交付，不擅自扩展接口。

共享发布仓库`/Users/leizhang/Documents/shoota/tmp/wt-portrait`交付前核对干净且仍在776a5fe；本任务未写该目录。远端最新状态及同版本双站健康检查由统筹执行，不因本地通过而省略。

## 文档与收尾核对

- 设计新增§79、更新§54顺序及§77空闲机限制，变更行v0.46。测试新增TC-JOINT-001至004及RUN-132；TC-IMMORTAL-001目录计数随新增项同步，未回改历史RUN。
- 直接影响FLOW-GAME-CATALOG，间接FLOW-PLAY；FLOW-SAVE-MOVE仅因共用index文件被报告归属，实际迁移代码未变。没有新增INV卡；范围约束由TC-JOINT-001逐字节审计，不声称未跑的INV用例通过。
- impact卡片级扫描新增/修改/废弃ID均0，不代表契约及目录没有修改；相应语义变更已记在设计§1、§54、§77、§79。
- 未新增Q或待确认现状；基线对象4860acf，链路现状待确认0→0、无用例数量不变。新分支核对不适用：沿用现有目录和沙箱链路。
- 设计链路lint零错误零告警；TEST检查退出0，保留旧TC/RUN格式告警，不将其写为全仓无告警。没有新增schema、第三方服务或跨游戏改动。
- 导览站：`/tmp/shoota-save-doc-cache/design-view/platform-save-reliability-20261028-1cdc1436/site/index.html`。
- 变更报告：本仓库`output/save-qa/joint-change-report.html`。自动图片差分因缺dwebp/magick跳过，截图人工目视完成；git提交说明如未做tour映射会提示英文原始标题，非代码错误。
- 报告未归属文件已说明：两款游戏与一张封面为指定成品；DESIGN/TEST为本轮同步；RUN-132为审计、预览和验收证据。生成报告、预览输出不入生产。无未解释的额外功能变更。
