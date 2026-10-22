# F1 独立验收 · 2026-10-22

只读审查，未修改游戏文件。Chrome（本机 Edge 不存在）。

## Driver

当前 src/app.js/mobile.css 对照 qa/paged-flow/before。

- 320×667、375×667、768×900、1440×900：完整正赛成绩分页并集各24人，唯一ID各24，集合等于引擎实际结果名单。
- 第5页刷新保留；采访选项刷新保留，确认后刷新为已完成回执。四尺寸操作栏底部659/667或884/900，无页面错误。
- 初审发现P2：手动读取/导入未签约存档不恢复openingJourney局部变量，后续save会覆盖原档选队/合同步骤。源位置初版app.js319/322、save18、启动恢复421。
- sports已加入统一restoreJourney到启动/读取/导入。独立复测通过：读取保留teamPage11/BYD正式合同step2，导入保留teamPage11/BYD正式合同step1。
- 新增“本站回顾/人气、收入与成长/车库关系”三页可达，第3页刷新保留，无错误。
- 未发现当前改动剩余阻断。

证据：report.json（含24人ID并集）、load-report.json；driver-<width>-results-1..5.png、driver-<width>-receipt.png、driver-load-fixed.png、driver-import-fixed.png、driver-impact-1..3.png。脚本review.mjs/load-review.mjs。

## Team Principal

最终SHA256：3af4f4cfc0aa2dcc7644554cdb435e5821a22d8bfbe32f042994b9df1cba3fbf（516979 bytes）。

- 顶部/策略页共享双入口生成器，renderMain同步重绘。
- quick/startLive验证stage、kind、LIVE、赛季结束与解雇状态。
- 独立390×844点击顶部观看，重复startLive/quick保持同一RS且积分0；结算后全场积分101，重复入口仍101且post，无页面错误。
- 本轮无阻断；普通刷新丢失直播临时进度为原有模型（autosave仅S），不是本次改动回归。

证据：report.json；tp-race-entry.png、tp-live.png、tp-results.png。
