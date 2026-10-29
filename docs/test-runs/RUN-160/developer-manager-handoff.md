# LOL经理平台容器验收与最终冻结

2026-10-29，本地开发交付，未提交共享仓库，未部署。独立LOL选手生涯文件未改动。

## 最终版本

- HTML SHA-256：`9684d3903e70c3a33455b2d8ce0db49435ab82686a81e55f813c191ecebd8554`，363,817字节。
- 源码/完整构建：`/Users/leizhang/Documents/ChatGPT/shoota/lol-manager/public/games/lol.html`。
- 独立成品：`/Users/leizhang/Documents/ChatGPT/shoota/峡谷经理.html`与`lol-manager/output/release/峡谷经理.html`。
- 游戏ZIP：`lol-manager/output/release/峡谷经理-20261029.zip`。
- 完整冻结目录：`lol-manager/output/frozen/lol-manager-9684d390-20261029/`。
- 完整冻结ZIP：`lol-manager/output/frozen/lol-manager-9684d390-20261029.zip`。
- 源、根HTML、release HTML与游戏ZIP内HTML逐字一致，冻结manifest列出全部文件哈希。

本次仅修复平台适配阻断：360×640中传奇跳过按钮超出首屏；844×390中直播决策被比分和工具栏挤到下方。现在紧凑传奇页减少留白，保持原字号及44/48px按钮；矮横屏直播左侧比分和页签，右侧决策，比分时间跨列，双方经济各自换行。

2014全球开局、完整战队清单、成长、转会、英雄池和版本机制不变。所有内嵌JavaScript与此前9aced860逐字一致，证明见rules-reuse.json。

## 实际平台环境

使用发布仓库`/Users/leizhang/Documents/shoota/tmp/wt-portrait`的c26dee1完整index和brand资源只读快照，未手造iframe或存档桥。
平台index SHA-256：`e5f14dacd09dbf89e916638090ca1778b736caefe27a3ecf5b8916a6c7e048b9`。
真实平台执行下载、inject、sandbox srcdoc iframe、Platform/存储代理、postMessage、IndexedDB、CJ1压缩与恢复；测试路由只将本地游戏文件映射到平台正式使用的无扩展名URL，统计API返回空JSON。没有调用内核函数代替UI操作；读取S及IndexedDB仅作结果断言，旧档夹具和长名字数据明确由测试构造。

Chrome 156.0.8078.73 **可见窗口**，桌面模拟CSS视口，100%缩放，reduced-motion。游戏外部Google字体阻断使用回退字体，平台自带字体正常读取。独立上下文不触及玩家正在使用的存档。

宿主360×640→iframe360×591；390×844→390×795；844×390→844×339.75。其他基础视口430×932、768×1024、1366×768、1440×900；补320×568、390×600、600/601断点及960/961详情边界。实际入口可复核`http://127.0.0.1:8769/#play-lol`，本地public/index仅开发缓存，发布时**不得整体覆盖统筹平台index**。

## 结果与复用边界

| 检查 | 证据与结论 |
| --- | --- |
| 生态平台真实操作 | ecosystem/results.json，81条：四尺寸自建、命名校验、Letme、市场补齐、选手五类详情、交易、比赛、旧档；可见Chrome通过 |
| 历史平台真实操作 | history/results.json，48条：11尺寸完整战队列表滚动末项并实际选择，54队清单、年代/赛区、自建GPL、传奇、四场比赛与刷新、现代旧档逐字保持 |
| 版本平台真实操作 | meta/results.json，33条：11尺寸赛前版本、英雄页所有分页与排序、暗色、旋转、四次系列赛与版本快照、旧档迁移 |
| 最终直播与CJ1 | bridge-live/results.json，31条：七基础尺寸均实际改首发和战术、切全部赛前入口、观看、切全部直播页、执行决策、完赛、双击确认、刷新；CJ1从公开UI导出并在新上下文恢复、刷新后存档逐字保持 |
| 未变数值证据 | rules-reuse.json：85历史、53生态、19版本规则及14赛季真实引擎模拟精确复用，游戏脚本逐字未变 |
| 独立最终成品 | offline-check.json：阻断HTTPS后冷启动、执教、跳过传奇、保存与刷新通过 |
| 静态门 | quality.txt：22页62脚本及Worker解析、资源与大小通过；ui-scan.json零发现；git diff --check通过 |

前三组平台流程在1a27b679上通过；其后唯一变化为直播比分CSS，三组所经开局、市场、交易、详情、赛前和快速结算不渲染该区域，证据可复用。七尺寸实际直播与CJ1已在最终9684d390重新执行，不能把旧版直播截图当最终证据。

目视已核对最终紧凑传奇签约/跳过及欢迎页、横屏战队末项、横屏英雄列表、最终横屏比分与全部决策选项。页面和visual viewport无意外横向溢出；详情列表保留有界滚动，首末项已操作。历史页390/844有对齐线截图和几何测量。排行榜大表为有意横向滚动，不宣称所有表格一屏铺开。

### 失败保留

- RUN-148：9aced860传奇跳过底边619.09px，iframe591px，超出28.09px；failure-legend。
- RUN-149：52156567横屏决策底边469.25px，宿主390px；failure-live。
- RUN-150：1a27b679自动断言通过，但横屏比分文字挤压，目视失败；visual-failure-score。
- RUN-151：最终复测在上述本地范围通过，未把失败轮改成成功。
- 初始本地平台无扩展名URL没有映射、测试误读平台闭包变量、CJ1异步解压未等待等属于测试适配问题，均已修正。无头Chrome的部分点击没有到达iframe，DOM命中与坐标均正确；等待、滚动和软件渲染无法消除。改用同版本可见Chrome后原点击流程通过，没有为此修改签约或交易逻辑。最终只使用可见Chrome通过证据。

## 复现命令

在冻结目录根运行。Node、Python3、Chrome和Playwright需已安装；当前脚本显式使用本机Chrome和Codex Node依赖路径，可按验证机安装位置调整这两个运行环境路径。

```sh
node scripts/lol-rules.test.cjs
node scripts/lol-meta.test.cjs
node scripts/lol-history.test.cjs
LOL_HEADFUL=1 node scripts/lol-platform-regression.cjs ecosystem
LOL_HEADFUL=1 node scripts/lol-platform-regression.cjs history
LOL_HEADFUL=1 node scripts/lol-platform-regression.cjs meta
node scripts/lol-platform-bridge-live.cjs
LOL_OFFLINE_HTML="$PWD/public/games/lol.html" node scripts/lol-offline.cjs output/platform-9aced860
```

平台验收脚本通过路由拦截读取冻结的真实host/index和brand，正常请求使用127.0.0.1:8769这一测试origin；已覆盖的页面资源均由冻结包提供。无需将测试快照部署到站点。

## 存档与待验收

存档键lolgm-save-v2保持。既有原始旧档导入、上一版现代档、2014档、CJ1备份恢复均在实际平台桥内验证。游戏规则/JS未改，存档无新增迁移。换file/HTTP入口仍需导出导入，浏览器不共享存储。

真实iOS Safari、Android Chrome、实际软键盘/安全区、200%系统字体仍缺环境，保持待验收；窗口缩小和旋转不冒充这些系统行为。本地可见Chrome通过不代表双站线上已验收。统筹还需核对远端最新平台状态、只整合本冻结HTML和LOL大小、验证test后再发布同版本main，并复验已有专用BLG旧档。

新版本冻结替代9aced860用于发布。只整合`public/games/lol.html`，其余冻结平台外壳是验收夹具，不应发布；数据出处、测试和报告供审计。没有部署或提交共享发布仓库，也没有改独立LOL选手生涯。
