# LOL经理数值与卡片修复交付 · 2026-10-30

本次把快速模拟5场、传奇卡完整显示和生涯数值校准合并到同一成品。未发布线上；用户原有127.0.0.1:8769页面与存档未被操作。

## 数值改动

| 选手/范围 | 调整 |
| --- | --- |
| Faker | 2014—2027所有开局潜力99；读取和导入旧档均修正为99，能力不重置 |
| Koro1（Korol） | 2015能力93→90；各年初始潜力95→92 |
| NaMei、GodV、dade | 生涯初始潜力分别94、92、94，移除资料不足额外抬高上限的影响 |
| Caps、Perkz、Jankos、Rekkles、Letme | 逐年修正明显低估的能力；换位置的赛季单独评估 |
| 30张传奇 | 全部复核，能力仍至少90；9人初始潜力下调，已培养旧档不回退 |
| 全库 | 3772条年度记录检查，989条能力/潜力组合变化，其中42条年度能力变化；明细changes.json |

传奇初始潜力调整：MaRin 97→96，Bengi 96→94，Ambition 95→94，Score、PawN、Bang、imp、PraY、GorillA均96→95。其余21张保留现值和各自评估说明。逐卡结果在legend-review.json。

能力与潜力是游戏评估值，不是官方评分。全库做了结构及一致性检查，重点选手做生涯校准，不把这说成已重新考证每一位普通选手的全部赛事。资料较少者仍采用同位置已收录峰值加2的估计，最高98；人工复核表优先。评分不因冠军队身份统一提高，潜力不因开局年份年龄增加而下降。

生涯依据包括已冻结的LOL选手生涯参考数据与逐卡来源。Faker的长期表现及首位名人堂身份见[Riot介绍](https://lolesports.com/en-US/news/lol-esports-welcomes-faker-to-hall-of-legends)；Koro1的2015 MSI表现与后续经历参考[赛事记录](https://lol.inven.co.kr/dataninfo/proteam/progamer.php?code=30031)、[生涯记录](https://lol.fandom.com/wiki/Korol)。Caps参考[Riot名人堂资料](https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-hall-of-legends)；Jankos参考[LEC官方2019夏季MVP](https://www.youtube.com/watch?v=d7IjJez_aqA)。数值分档是据这些资料作出的设计判断。

## 用户操作

- 比赛、复盘之后仍从右上角推进；“快速模拟5场”按本队完整系列赛计数，自动跨过空档，到赛季结束停止。
- 翻卡→再点击选中→确认签约→进入球队。大号位置字母作为背景，姓名和数值完整保留。
- 刷新当前本地游戏可载入代码更新。Faker旧档自动修正，其余新评级在新开局生效，保护已练出的能力和潜力。

## 验证与证据

- 引擎：`node scripts/lol-career.test.cjs` 42；training 67；rules 53；annual 118；player-ui 31；quick-five 16；meta 19，总计346断言通过。年度测试实际完成13个赛季。
- `python3 scripts/build-lol-history.py`离线重建后字节一致；`scripts/check.mjs`检查平台脚本；`git diff --check`通过。
- `ui-constraints/scripts/scan.mjs public/games/lol.html public/index.html`无P0/P1/P2发现，动态项另由浏览器核对。
- 真实GPT内置隐藏浏览器，localhost:8775平台sandbox iframe。中国15卡在7个基础视口逐一检查；韩国15卡在360×640、390×844、844×390、1440×900检查。所有姓名和数值的文本Range均在卡片内，页面无横向溢出。
- 实际Clearlove竖屏和Easyhoon横屏选择、签约、返回球队；进入按钮至少44px且可见。逐卡记录browser.json，截图cards-360.jpg、signed-360.jpg、signed-844.jpg、signed-desktop.jpg。
- 2015 EDG的Koro1详情90/92；旧Faker100即时修为99，刷新保持。browser-migration.json及faker-99.jpg、koro1-2015.jpg。
- 最终版连续两次五场模拟均完成5场，第二批是第6—10轮，无重复比赛。five-final.jpg和five-viewports.json。控制台error为空（console.json）。
- 数值变更使旧随机种子2不再触发队内动态；记录原失败后换为已自然产生两条动态的种子4，未改产品随机规则或断言。

遵循现有DESIGN.md、用户截图及web-game-responsive/ui-constraints约束，复用原有本地卡片、按钮和色彩，无新依赖。保持单文件离线数据，无后台接口或生产mock切换。原有颜色、标题层级、卡片边框和滚动规则不变；只让装饰退出正常排版并给实际内容留出空间。没有引入新动效、侧栏、卡片类型或第三方组件。

真实手机触摸、安全区、软键盘、200%字号、系统字体、线上测试站和正式站未验收。后续发布需由发布统筹对同一成品验收，不能将本地结果写为已上线。

## 路径与版本

- 源码：`public/games/lol.html`；索引体积：`public/index.html`。
- 复核表：`assets/history/career-review.json`；生涯重建：`scripts/build-lol-history.py`；传奇资料：`docs/lol-legends.json`。
- 成品SHA256：`79aa053b8f049181ef9b4c32e6c44b0b0567c226d58a85ce0644faf928e8cfe5`。
- 完整冻结包、单文件和离线ZIP路径及指纹见本目录`handoff.json`。
