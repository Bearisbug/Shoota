# LOL 选手生涯 v1.3.3 · 冻结交付（IAB证据补齐）

正式名称：LOL 选手生涯。建议平台 id：`lol-player`。新作，与 `lol`（LOL 经理）独立。

当前 HTML SHA-256：`4be445446780e3a4f1b13cfc3c50b362eb052c0945875138f779527c55dc0786`。
源码目录：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/src`。
完整构建：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/dist/lol-player.html`；`dist/index.html`内容一致。
重建：项目根执行 `python3 scripts/build.py`，无需网络或第三方 Python 包。

## 范围与修复

本次不新增新英雄按年份推出或独立练习系统。冻结之前已完成的选手生涯、历史开局、徽章、版本生态与队徽展示。

平台实际 sandbox 不包含 allow-downloads，游戏内「导出存档文件」在独立页正常、iframe 内没有下载事件。只修复此阻断：平台内改用可全选复制/粘贴恢复的存档文本弹窗，独立页保留文件下载。错误文本不改变原存档；仍支持文件导入及平台 CJ1 备份。修复位于 src/app.js、src/style.css；版本标记 src/career.js、scripts/build.py。

未回写经理版源码、未修改正式平台、未部署。

## 实际宿主与入口

采用当前线上平台提交 `c26dee1d7e56be6ed94927684d4efd13da573d38` 的 public 原文件副本。仅在副本 CATALOG 前加 lol-player 验收条目并放入游戏文件；iframe、sandbox、BOOT、IndexedDB、Saves、CJ1 代码不变。`host-provenance.json`记录原文件及副本指纹。`public/`随交付包提供，独立复测不依赖正式平台目录。

持续本地地址：http://127.0.0.1:63984/#play-lol-player
服务只绑定本机；本地测试 API 由 release-host.cjs 返回空成功响应，不验证线上 API/统计。

## 已执行

Chrome 156.0.8078.73，桌面真实浏览器模拟视口，默认字号和1倍缩放。没有 Microsoft Edge 安装。使用隔离浏览器上下文，无用户存档参与。

1. `node scripts/release-browser.cjs`：198 项断言，7基础视口各跑完整流程，零 pageerror。
   - 360×640、390×844、430×932、844×390、768×1024、1366×768、1440×900。
   - 输入身份/赛季→现役队合同预览→自建队→主页→同页档案与徽章→赛前全部入口和战术→临场决策/地图/战报/数据→完赛复盘→下一轮。
   - 战术切页保留、赛前旋转恢复、比赛刷新保留、复盘刷新无重复结算、招募空搜索、合同申请、文本备份和错误恢复、文件导入。
   - 320×568、390×600及附加边界的窗口切换矩阵用键盘执行，初次指针投递失败记录保留；指定连续缩窗路径已由统筹IAB实际点击补验通过。
2. `node scripts/release-save-bridge.cjs`：实际平台界面导出 CJ1→全新浏览器上下文粘贴确认恢复→进游戏→刷新，生涯快照完全相同。旧v1 Echo390导入；LOL经理命名空间测试标记保持、选手iframe无法读取它；空名称校验、长名称、自建队双击只创建一次通过。见 bridge.json。
3. `node scripts/release-extras.cjs`：新建窗口的窄屏/断点补测与名单首末页，最终结果见 extras.json（只有该文件成功结果属于通过证据）。
4. `node scripts/eras-badges.cjs`：2014–2027开局、徽章与跨年路线通过，eras-tests.txt。
5. `node scripts/simulation.cjs`：自建队/T1替补/LNG首发三条双季路线、招募意愿、重复结算和存档往返通过，career-tests.txt。
6. `node scripts/meta-depth.cjs`、`node scripts/meta-simulation.cjs`：英雄深度、版本变化、BP、实际战力与位置权重因果检查通过。报告副本 verification/ 下。
7. ui-constraints扫描 P0/P1/P2均0。这不替代浏览器验收。

截图在 browser/ 下，覆盖所有基础视口的主页、赛前、复杂详情、比赛、复盘、文本存档。主操作均通过边界可见断言并实际点击。长名单采用局部分页/表格滚动；选队全部同页是用户明确要求的例外。没有小说长剧情流程，标不适用；最长选手详情有单一滚动内容区及固定关闭栏。

## 存档

游戏内 key：`lol-player-save-v1`；格式 `format:lol-player, version:1`。平台域为 `local|lol-player`，与 `local|lol` 分开。v1格式不迁移，旧存档兼容。旧进行中比赛沿用已保存快照；新局使用当前规则。平台CJ1已实际跨新上下文验证。测试中经理命名空间使用明确的测试标记，不宣称模拟了一局真实经理游戏。

## 交叉验收与未验证

- **连续缩窗后的指针投递**：无头Chrome在桌面→320×568→390×600的iframe导航中出现指针事件未到达子文档。元素命中检查正确、app.inert=false、modal.hidden=true；定位器和按实际坐标点击均有缺失。键盘可操作；全新同尺寸窗口另测。未据此擅改平台；统筹IAB已对同指纹、同平台副本实际点击复核通过，原Chrome问题归为该自动化环境的投递限制。证据 browser/resize-pointer-failure.*、crosscheck.json。
- 复现：创建选手加入T1；桌面缩为320×568；底部战队阵容→选手详情→关闭→主页；改为390×600再点战队阵容。预期切到阵容，失败时仍在主页。不是通过调用内核验证点击。
- iOS Safari、Android Chrome真机、真实软键盘、安全区/地址栏动态、200%原生文字缩放未具备环境，待验收；窗口变矮不能冒充键盘。
- 线上API、双站最终容器和发布后健康检查由统筹完成。
- 历史阵容与游戏模拟版本生态分开，统一英雄库不按发布日期解锁；未承诺真实历年补丁复刻。

结论：核心浏览器流程、规则与平台存档桥通过；指定连续缩窗指针路径已由IAB交叉验收通过，真机等项目仍待验收，**不宣称全部移动端适配验收通过**。成品可供统筹独立复建与继续验收，未经发布。

## 补充结果与复测说明

extras.json 已完成：新窗口 320×568、390×600、650/651×800、700/701×800、1000/1001×800的指针点击通过；406名选手21页、市场60页首末遍历通过，单条/空搜索、筛选回到第一页通过。新窗口结果独立记录；连续缩窗结果以新增IAB证据为准。

独立离线HTML文件下载回归见 offline-export.json。完整浏览器测试运行方式：项目根执行 `node scripts/release-browser.cjs`、`node scripts/release-save-bridge.cjs`、`node scripts/release-extras.cjs`。脚本自动用随机本机端口服务包内public副本，结束后关闭服务。无需运行 prepare-release-qa.py；它只负责首次从指定平台Git提交制作夹具。脚本使用本机Chrome和已安装的Playwright，路径见脚本首行；换机器须设置对应运行时路径。历史开发脚本保留用于追溯，不等于本轮发布命令列表。

## 统筹 IAB 交叉验收收口

同一 HTML 指纹下，统筹在持续平台副本中以实际 AX/Playwright 点击完成：1440×900创建 PublishQA／MID／2027并加入T1 → 320×568点击战队阵容 → 点击Doran详情并关闭 → 390×600点击主页再点战队阵容。结果通过，无内核状态调用、注入或键盘代替点击。

证据已复制入 `iab-crosscheck/`：player-resize-iab.json、两张阵容截图及320视口AX文本。开发对话核对了JSON指纹与通过记录，并目视复核两张截图；不将统筹操作称为本对话自行执行。原Chrome失败截图与日志继续保留，真机/软键盘/安全区/200%原生文字缩放等边界不变。

本次只补齐文档与验收证据，源码和HTML字节未变；ZIP及manifest因证据增加而更新，上一版证据包保存在output/releases/evidence-history。此后维持冻结，不部署。
