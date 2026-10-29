# 航司bfaca成品集成交付

2026-10-29。隔离仓库：/Users/leizhang/Documents/ChatGPT/shoota/tmp/platform-save-reliability-20261028。
父提交和发布范围基线：7157e29f4dbe40848cd50187c4a0035c8cc779d5。本轮不push、不部署，不改共享wt-portrait；保留旧提交和历史RUN。

## 产物与来源

| 文件 | 字节数 | SHA-256 |
| --- | --- | --- |
| public/games/airline-empire.html | 1414610 | bfaca668cd9e887964909bc8550083d3de6dc6858b7ba8a534c720576274f932 |
| public/index.html | 126153 | e5f14dacd09dbf89e916638090ca1778b736caefe27a3ecf5b8916a6c7e048b9 |
| 云际航空-离线版.zip | 784479 | 0e85bccf4308773aead1921201bdfb61d5d648aaf4078e406fffb89e6dc61dd4 |

冻结目录：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-29-bfaca668cd9e。
完整构建为该目录云际航空.html；完整源码为source/dist，构建脚本source/build-local.py。根HTML和ZIP在/Users/leizhang/Documents/ChatGPT/shoota。

verify-source.py实际校验100项清单字节数与指纹、根HTML/ZIP和包内HTML；复制source到临时目录独立执行构建，重建HTML逐字节相同，未改冻结源码或根产物。清单SHA为32ba3ca6e24d267855c5a8322df1e4e9bd0a079390984e17a8ae7d74d2a2b463。结果见source-verification.json和rebuild.txt，清单与开发交付/报告有快照。

## 变化与范围

飞机去向图解释机队分布、备用和可增派口径；客流推荐按实际航时/周转/时刻排满可执行班次，比较整线票价及独立旅客增长，并显示让利预算和成本。手动新增/增派默认排满，允许修改；编辑旧计划不填满。统一同机场对票价，保留原有配机班次。汰换可用同基地合格空闲飞机接续原计划，不强制新购；排除备用、检修代飞、关联订单等不合格飞机。性能和收益不作保证。

平台仅原样替换指定航司HTML及catalog size 1398891→1414610。scope-audit.cjs以7157e29执行真实目录并逐字节核对public、src、工作流和wrangler：其他18款、封面、桥、Worker、首页其余字节和十九款顺序保持。此生2、航司3、租车10；全球高武未上架。没有手工修改游戏HTML内容。

GitHub真实远端开工时main/test均为7157e29，见remote-before.txt；隔离origin实际指向本地共享checkout，其旧main引用不是GitHub最新状态。提交前两次复查遇到SSL_ERROR_SYSCALL，见remote-after.txt；不将连接失败当作远端无变更，发布统筹必须上线前再核对。仅本地追加提交，不覆盖远端。

## 本轮测试

RUN-140：TC-AIRLINE-031和TC-JOINT-005通过2/2。

- 冻结100项、根文件、离线包内容、独立源码重建、平台副本一致。
- node scripts/check.mjs：22页、62段脚本及Worker解析通过，资源与登记大小一致。
- node scripts/catalog-titles.test.cjs：19/19真实Worker名称读取匹配。
- node docs/test-runs/RUN-140/scope-audit.cjs：仅授权两项运行文件改变。
- DESIGN检查退出0，链路lint零错误零告警；既有REQ-016缺Gherkin等提示保留。
- TEST检查退出1，父提交旧TEST相同退出1。告警仅旧TC-035/073/074和RUN-035格式，未新增；test-lint.txt与test-lint-baseline.txt保留对照。不声称文档全绿、不重写历史测试结论。
- UI扫描P0=0、P1=0、P2=1：日历不同网格列的角格/日期头均sticky top:0，未擅改冻结成品；实际滚动重叠及notCovered项交浏览器验收核对。

## 开发证据、兼容和待验收

开发报告记录342/342模块测试通过，本轮未重跑该游戏套件。飞机去向图从最终源码/成品核对存在；开发完整浏览器补验仍在进行，不能用代码存在代替交互验收。

原开发IAB真实平台副本http://127.0.0.1:8940/，宿主顶栏49–50px，合成CJ1档：8机增派5项后旧2计划保留、统一65%票价；空闲005接替旧机后8→7机；手动广州增派26次后同线27次/2机；新开4项一键执行。推荐页面360×640、390×844、430×932、768×1024、844×390、1024×768、1366×768，加320×568、667×375。见冻结evidence/report.md、final-layout.json、final-growth截图及ui-save-check.json。报告明确早期截图与最终逻辑复测边界，本对话不冒称重跑，也不将早期截图全部认定为最终完整验收。

存档版本与键保持，trafficPrice为可选布尔值；旧CJ1导入、执行后导出及引擎加载由开发验证，不重置既有安排。1000架基准为隔离Node样本，增长分析仍超过100ms，不承诺所有设备100ms。真实玩家存档未访问。

完整最终浏览器矩阵、真机iOS/Android、软键盘、安全区、200%字号、长期多周竞争回退/让利预算耗尽、双站上线未验证。原RUN-135的320宽平台导航问题未修复。统筹须等开发补充并独立验收，先测试站、后同版正式站。

## 规范与文档收尾

沿用已读取的project-workflow/design-doc/test-doc，重新核对ui-constraints及项目AGENTS；工作区web-game-responsive验收要求保持。沿用平台品牌和本地组件，无新增依赖、mock、后端接口或视觉系统；本轮只复制冻结成品，不承担游戏界面实现。无新增不可逆决策或Q。

影响REQ-010、REQ-021、FLOW-GAME-CATALOG、FLOW-PLAY；潜在名称读取已回归，桥字节不变。没有兄弟文档接口影响。DESIGN v0.53、§84补功能边界及Gherkin，TEST新增TC-AIRLINE-031/RUN-140。文档对象基线a18b96ec57dbaf5ea6f200cf7f8d3ce1681fb3dd；impact报告已变ID0指链路卡未变，契约补充另记。现状待确认0→0、无用例4→4，无待复核ID；未执行INV用例不声称通过。

改动报告output/save-qa/airline-bfaca-change-report.html。共享首页导致存档搬家链路被标计划外，桥代码逐字节未变；未归属文件为指定成品、DESIGN/TEST及RUN-140证据。缺dwebp/magick，未做自动图片差分。导览站/tmp/shoota-save-doc-cache/design-view/platform-save-reliability-20261028-1cdc1436/site/index.html。

完整提交、补丁及指纹另存output/save-qa/airline-bfaca-delivery.json。此交付是集成完成，尚非发布完成。
