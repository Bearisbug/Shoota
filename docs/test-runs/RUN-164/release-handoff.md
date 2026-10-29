# 两款LOL新内容与正式名称：本地集成交付

基线81f69f75c23e6f42e4c3b650e2cb94c0854b283c。由本平台对话在既有隔离仓库集成，未远端推送、未部署，未修改共享发布仓库。

## 成品

| 标识 / 平台名称 | 最终HTML SHA-256 | 字节 |
| --- | --- | --- |
| lol / 我在LOL建银河战队 | 7ae76e6278d6cc15408497c58cb309e1bb7c54068d09101be7965d8249ee9cb9 | 1945522 |
| lol-player / 我是职业通天代 | 952009b5d239dd32ebe7c48ddf069ceb5c4a9d5bb58c2849799d9b791fa87496 | 3594915 |

经理来源：`/Users/leizhang/Documents/ChatGPT/shoota/lol-manager/output/frozen/lol-manager-7ae76e62-20261030/public/games/lol.html`；完整ZIP为同目录名.zip，211项清单核对，构建入口scripts/build-lol-final.py将单文件规范源码原样产出，临时输出与最终HTML一致。

选手来源：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/output/releases/lol-player-v1.4.1/dist/lol-player.html`；同名完整ZIP与外部清单核对639项。将冻结src及scripts/build.py复制到临时目录独立重建，与最终HTML逐字一致。完整来源、ZIP指纹和重建路径见两份verification.json。

公共文件只改首页及两款LOL成品。首页只改两个目录对象的名称、简介、大小；选手宣传为16岁、潜力98及个人行动，经理介绍年度开局、训练与新秀。其他18款、封面、排序、游戏入口、存档桥、Worker和发布管线逐字保持。scope-audit.json及content-scope-audit.cjs可复验。

## 本轮实际验收

- 内置后台浏览器实际隔离public服务，无外部Chrome。平台18个顶栏记录覆盖360×640、390×844、430×932、844×390、768×1024、1366×768、1440×900、320×568、390×600；退出/全屏在边界内，与旧名基线同高。
- 搜索全名、卡片、详情、精选、游戏库、存档列表/恢复确认采用新名；简介16岁。复用上一候选已执行且未改变的目录文案展示，最终只更换两游戏及size，具体对照见evidence-summary.json。
- 最终经理360竖屏末项决策48px高、底519.98px，在591px游戏区内；实际点击后完成整场，BLG2:0LGD，刷新保留。
- 最终选手844横屏末项48px高、底296px，在340px游戏区内；实际点击并显示反馈，完成第3轮后自动跳过无本队比赛的第4轮，刷新保留第5轮、原姓名战队及战绩。
- 旧档由RUN-160原始夹具经上一候选迁移后在最终版继续；初始合同与旧比赛日志保留证据见RUN-162/candidate-old-save-comparison.json。开发方最终版还直接验证了旧进行中档导入与一次结算。最终平台CJ1导出后，在初始空白的新来源55308恢复两款、进入并刷新；再导出两个游戏存档分别逐字相同。restore-check.json为核对证据，未触及真实玩家存档。
- 质量门23页70内嵌脚本、二十名称、范围审计与git diff --check通过。UI扫描P0/P1/P2均为0。设计文档lint无新增错误；测试文档仍有TC-035/073/074和RUN-035等存量格式问题，本轮新记录无新增告警。

## 证据复用与未验证

完整游戏七尺寸与四核心循环、跨年新秀、空档推进与长资料等由各原开发对话交付；报告原样保存在manager-handoff.md、player-handoff.md。经理本次CSS修复内嵌JS与b91相同，288规则结果可精确复用。选手最终规则模块不变，career仅VERSION不同；四循环来自同核心流程的中间样式版，最终七尺寸/五项决策/旧档/CJ1另有复测，不把中间截图算最终截图。本平台轮不重复无关长程模拟。

真实iOS/Android、原生键盘、安全区、200%文字缩放未验收；320窄矮屏允许局部滚动。测试站/正式站CI、健康检查及线上专用存档由发布统筹继续执行。本提交仅交付本地集成，不代表已经上线。

变更报告已生成：output/save-qa/lol-new-content-change-report.html。共享首页使FLOW-SAVE-MOVE被报告为计划外关联流程；存档桥未改，已实际完成双游戏跨来源恢复验收。环境缺少dwebp/magick，报告的自动像素对比未运行；真实浏览器截图和几何检查另有记录。
