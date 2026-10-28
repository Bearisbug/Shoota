# 航司fcbac成品集成交付

2026-10-29。隔离checkout：/Users/leizhang/Documents/ChatGPT/shoota/tmp/platform-save-reliability-20261028。

父提交9fc5f3897e92286ad58a859e17c949def1fe84a4；发布范围基线b7f6b7f8eddb29997fc10988d087d709eddacdce。追加提交，保留c807历史，没有amend。未push、未部署、未写共享wt-portrait。

## 成品与来源

| 文件 | 字节数 | SHA-256 |
| --- | --- | --- |
| public/games/airline-empire.html | 1398891 | fcbac2e5f9a0f9edb94f97cc326cc5a16981018a8ddc2bdb70fe2958d05e949a |
| public/index.html | 126153 | 5f866cb1a3cc022f1a09f3573b569a0578d50ef55805312e3d8a619e499b15cb |
| 云际航空-离线版.zip | 779794 | 6097ea651885f22911317d7fec9743e56d1915ae359f7ae57c2a0d7da228c732 |

冻结目录：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-28-fcbac2e5f9a0。
完整构建为该目录云际航空.html；源码为source/dist。根目录完整构建为/Users/leizhang/Documents/ChatGPT/shoota/云际航空.html。根ZIP与冻结ZIP逐字节相等，包内唯一HTML与冻结、根和平台副本相同。

source-verification.json记录117项manifest文件全部验证通过。清单、开发交付及原始报告各有只读快照；完整原始浏览器证据保留在冻结目录evidence，逐项受manifest指纹约束。manifest SHA-256：be1d26e8ff942a96225bd802422d5498dc928a890890916a211451c0851ec0a7。

本次宿主HTML还与开发浏览器证据evidence/host-index.html逐字节一致。没有把c807的旧截图当作fcbac新证据。

## 范围和使用变化

玩家在航线配机入口先选机型，再选具体飞机，看到总数、本基地可用数及不可用原因。目的地按大洲、国家或地区、城市或机场联动；切换保留手动选机、班次和草稿。移除所有页面公共机务提醒横条，保留机库与滚动检修专页。保留c807竞争与保存优化。

原样复制完整游戏，未手工修补成品。相对父提交首页只改航司size 1392513→1398891；相对发布基线为1383979→1398891。scope-audit.cjs真实执行目录并逐字节比较所有基线public、src、工作流和wrangler文件：仅指定两项运行文件不同。其余18款、全部封面、Worker、桥、十九款目录字段和排序保持。此生第二、航司第三、租车第十，全球高武未上架。

## 本轮集成实测

RUN-139：TC-AIRLINE-030、TC-JOINT-005通过2/2。

- node scripts/check.mjs：22页、62段脚本与Worker解析通过，资源与登记大小一致。
- node scripts/catalog-titles.test.cjs：实际Worker提取19款名称，19/19匹配。
- node docs/test-runs/RUN-139/scope-audit.cjs：范围审计通过。
- Python核对冻结117项、根HTML/ZIP、ZIP内容及开发宿主字节一致。
- DESIGN检查退出0，链路lint零错误零告警；旧REQ-016缺Gherkin等机械提示保留。
- TEST检查退出1，原因均为旧TC-035/073/074缺陷标记及RUN-035记录格式；对父提交旧TEST再次运行也退出1且告警相同，见test-lint-baseline.txt。本轮没有新增告警，不将其误写为文档全绿，不改历史轮次结果。
- UI扫描P0=0、P1=0、P2=1：日历角格和日期标题都sticky top:0，处于不同网格列。未擅改冻结游戏；具体滚动重叠与其他notCovered项仍由浏览器验收核对。

## 开发证据与未验证项

developer-report-snapshot.md原开发报告记载329/329模块测试通过，本轮未重跑；统筹独立复建及329测试待执行。

原开发在Codex内置浏览器、真实平台副本http://127.0.0.1:8940/#play-airline-empire验收：360×640、390×844、430×932、844×390、768×1024、1366×768、1440×900选线、报价、总览与结算；360同线新增配机/双击防重，390/844/1366实际开航结算；320×568及390×600局部滚动降级，599/601、699/701、959/961断点。证据为冻结evidence内截图、layout数据及report.md；这是开发来源记录，不冒称本对话重新操作。

旧CJ1恢复、basic导出再恢复继续W2，千架W8打包导出记录已由开发验证。主档与双备份共4,359,591字符。保持原存档格式、键及可选字段缺省，不新增必填项、不重置资产。未访问真实玩家档案；没有100ms全操作性能承诺。

统筹完成独立复建、浏览器复核、测试站验收后再将同版本发布正式站。本轮未执行线上测试、真机iOS/Android、软键盘、安全区、200%字号及未改动页面全面矩阵，不能标为完整适配上线通过。历史RUN-135的320宽平台精选导航裁切未修复，记录保留。

## 规范与文档收尾

加载ui-constraints、project-workflow、design-doc、test-doc及工作区web-game-responsive；沿用现有平台品牌与组件，无新增依赖、视觉系统、mock、后端接口或不可逆决策。开发端界面规范和真实操作证据见冻结报告；本轮按统筹分工只做成品集成。

影响REQ-010、REQ-021、FLOW-GAME-CATALOG、FLOW-PLAY；变更已在既有授权范围。平台存档桥和看板提取为潜在影响，桥字节保持，名称真实回归通过。没有兄弟文档接口变更；无新Q或不变量。未执行的INV用例不宣称通过。DESIGN v0.52新增§83契约与Gherkin；旧§80补全后续对象名；TEST新增TC-AIRLINE-030和RUN-139。

impact相对开工文档对象5d63f9e021c95bda4a41fcefb7e520d2146c01a0报告已变ID为0，表示链路卡未变，不表示契约没有补充。无待复核ID；现状待确认0→0，无用例4→4；本轮未进行新的分支提问，无新增设计决策。

改动报告：output/save-qa/airline-fcbac-change-report.html。共享首页使存档搬家链路被标为1项计划外变化，已核对桥代码字节不变。未归属改动为指定游戏、DESIGN/TEST和RUN-139证据，均在授权范围。缺dwebp/magick，未做自动图像差分。导览站：/tmp/shoota-save-doc-cache/design-view/platform-save-reliability-20261028-1cdc1436/site/index.html。

完整提交、补丁和最终指纹另存output/save-qa/airline-fcbac-delivery.json。统筹应读取本记录后继续验收，本对话未向其他对话发送消息。
