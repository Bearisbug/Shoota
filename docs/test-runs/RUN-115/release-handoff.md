# 航司最终冻结版上线前验收 · 2026-10-26

## 结论与范围

最终版 **8125e7bab8a1** 的桌面 IAB 七种视口、四尺寸核心流程及本次受影响交互复测通过。发现的两处双击误操作已修复并用同序列复测。**真实 iOS Safari / Android Chrome、实际触摸手势、系统键盘、安全区、200% 文字未验证，因此不宣称全部移动端上线验收完成。** 未部署网站。

本次只增加共用点击捕获防护：同一次多击手势的后续点击不执行按钮、操作入口或遮罩动作。正常单击、键盘 Enter 和随后独立操作保持可用。经营数值、存档结构、日历布局及排班算法不变。复用现有按钮与模态，无新增依赖。规则：工作区 web-game-responsive、ui-constraints、project-workflow。航司源目录没有独立 docs/DESIGN.md；按跨对话分工，平台 docs 由发布统筹更新，本交付提供分支与用例记录，不修改平台仓库文档。

## 版本、入口与证据

- 游戏 HTML SHA-256：`8125e7bab8a1938f4eb063137e8455353d7876890bebbf52d9f29c79141db188`
- ZIP SHA-256：`3addddf90d8337d99ff534aa3dc3246e3d4511bc3ee78ea6b6922ea828557aea`
- 源码文件清单指纹：`2987e19dae0352f6a03bfa502de73829359ea8ef2fd64e0e25229056a65d392b`；详见 ../../source-files-manifest.json。
- 源码：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-26-8125e7bab8a1/source
- 完整成品：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-26-8125e7bab8a1/云际航空.html
- ZIP：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-26-8125e7bab8a1/云际航空-离线版.zip
- 平台：/Users/leizhang/Documents/shoota/tmp/wt-portrait/public/index.html；HEAD `2c07a2e066843168627e7a1c83d9829aac690345`；HTML SHA-256 `954376126d2e5281a1b985826c21945dc94d8424c680f4e48833e4af57b27d96`。
- 入口：http://127.0.0.1:8915/#play-airline-empire；真实平台 iframe 存档桥，非 DOM 替身。预览仅将游戏路径指向此冻结 HTML 并按文件大小更新平台清单；API 不触达线上。
- 浏览器：Codex IAB 桌面浏览器（工具未提供具体浏览器内核版本）；100% 缩放，visualViewport.scale=1。不是手机真机。
- 夹具：同目录 fixture.html / fixture-manifest.json，均通过测试页按钮写入仅 localhost:8915 的隔离 IndexedDB；未使用或修改真实玩家存档。
- 同目录截图均来自修复后最终产物。助手截图函数曾继续写入旧证据目录，最终轮次从 `1440-dense-calendar`、`1440-double-confirm-after` 开始的记录及截图已归入当前目录；说明见 evidence-note.txt。旧图不计为最终通过证据。

## 七尺寸矩阵

每种尺寸均执行：旧存档载入 → 航线编辑 7 改 6 → 切经停页再返回核对草稿 → 保存 → 经营一次 → W02 和 6 班 → 关闭汇总。随后检查双向日历、宽体三舱编辑。主操作实际点击成功；详情使用有边界的内部滚动，主确认按钮固定可达。

| 外层视口 | iframe 可用高度 | 主界面/编辑/结算 | 日历/三舱 | 证据前缀 |
|---|---:|---|---|---|
| 360×640 | 591 | 通过 | 通过，双向时区文字换行，提示尾部约10px需局部滚动；航班与主按钮可见 | 360-* |
| 390×844 | 795 | 通过 | 通过 | 390-* |
| 430×932 | 883 | 通过 | 通过 | 430-* |
| 844×390 | 340 | 通过，弹窗详情内部滚动 | 通过，侧边操作区与主按钮可见 | 844-* |
| 768×1024 | 974 | 通过 | 通过 | 768-* |
| 1366×768 | 718 | 通过 | 通过 | 1366-* |
| 1440×900 | 850 | 通过 | 通过 | 1440-* |

根 scrollWidth/clientWidth 在七尺寸均相等。主界面本周次要计划在紧凑屏位于内容区下方，顶部五个经营调整按钮与经营下一周固定可达。日历是明确的独立双轴滚动区，不把其1962px内容宽度判作页面溢出。390实测内容区390/390，日历356px视口/1962px内容；日历垂直高度301/2440，正常局部滚动。

额外验收 320×568、390×600、700×844、701×844、1099×768、1100×768：无根横向溢出；窄矮降级保留主按钮并允许内容局部滚动。见 *-calendar-extra.jpg。真实安全区和200%字体不由压缩视口替代。

## 用例与实际结果

| 用例 | 操作与实际结果 | 证据 |
|---|---|---|
| 旧档继续/四尺寸核心循环 | 360、390、844、1366以及其余三尺寸：编辑草稿保持6，保存后只到W02，航线为6班 | *-overview / *-route-edit / *-settlement |
| 新局与双机场 | 四川省→成都双流CTU；保留天府TFU选项；长中文航司名；新局进入W01 | 390-newgame-base |
| TC-AIR-DOUBLE-01 源自缺陷 | 1440 pair：双击联动排班确认。修复前误开周五详情；修复后弹窗0个、去程14班，周数不变 | ../before-1440-double-confirm-clickthrough；1440-double-confirm-after |
| TC-AIR-DOUBLE-02 源自缺陷 | 390 CTU新局：双击快进。修复前暂停1/5；修复后在W04城市剧情暂停，转844选择自然客流后自动到W06，无第二次继续确认 | ../before-390-double-fastforward-before；390-batch-decision、844-double-fastforward-after |
| 键盘/正常操作 | 联动排班确认和宽体改舱应用使用Enter成功；单击导航、分页、取消、保存均可用 | 日历、改舱后保存记录 |
| 密集班次 | 两架07:00同班时段展开1/2、下一班2/2可见A350；无航班丢失；自动排班后07:00/14:00分开，返程09:45/17:00 | 1440-dense-calendar、1440-dense-second-flight、1440-calendar |
| 多机舱位/防重扣 | 窄体两舱156/12/0，宽体三舱265/36/8；窄体应用双击只扣31.2万，宽体75.4万；1000百万元变为998.934 | *-wide-cabin、390-narrow-cabin、saved-after-cabin-time.json |
| 时刻与旋转 | 周日详情可达；周一改08:15，旋转844保留草稿，返程11:00；其他日仍原时间 | 390-sunday-detail、844-manual-draft、390-return-edited |
| 日历定位/滚动 | 390周四left816/top936 → 844 left420/top936 →390 left816/top936；列宽272→140→272。键盘ArrowRight到left40，PageDown到top281；吸顶日期栏与时间角同一行分区 | 844/390-rotation-thursday、390-calendar-key-scroll |
| 跨周/时区 | HGH周一出发，返程以LAX时区显示01-04周日23:45（跨周），抵达HGH01-06周二06:00，未折回本周日 | 390-crossweek-calendar、390-crossweek-detail |
| 延误门槛 | 报告夹具180分钟仅有2条其他经营建议，无延误项；181分钟出现严重延误与运行清单，清单1班、改签7、等待5、退款6 | 390-delay180-first/last、390-delay181-advisor/list |
| 运行清单分页 | summary夹具广州延误+重庆运力两项；390合并显示，横屏重新打开1项/页，末页重庆。打开后旋转保留原分页容量，可局部滚动末项，关闭及主按钮始终可达 | 390-multiple-operations、844-rotated-operations、844-multiple-last-page |
| 市场长列表 | 法国16项遍历4页，末页可操作；切新加坡重置1页；搜索长无空格字符串得空结果，再搜新加坡航空单条并进入详情 | 390-market-last-page/one、390-traffic-empty-long/one |
| 空/错误 | 空航线显示开航指引；超100小时夹具自动排班报错，前后日历文字一致，原计划未改 | 390-empty-calendar、390-infeasible-auto |
| 保存桥/刷新 | 实际平台显示已存档，刷新后两机舱位与周一495分钟保留；保存记录中W01、cash998.934 | 390-reload-narrow/wide、saved-after-cabin-time.json |

## 自动检查和边界

- 冻结 source 下 `node --test tests/*.test.cjs`：227/227，通过，见 ../frozen-tests.txt；包括旧存档迁移及改签、赔付、口碑回归。
- 独立临时目录复制冻结源码后运行 build-local.py，HTML逐字节指纹一致；ZIP内HTML也一致，见 ../rebuild-check.json。
- ui-constraints 扫描：P0=0、P1=0、P2=1。P2为日期栏与左上时间角同时 sticky top:0；它们属于同一行不同列，时间角有独立层级覆盖水平滚入部分。真实滚动检查无上下堆叠遮挡，故保留。未改样式和布局。
- 浏览器 error/warn 记录为空。图片已目视检查紧凑竖屏、矮横屏、三舱表单、日历和运行清单。没有新视觉系统、暗色主题或后台接口改动。
- 缺少真实手机环境：iOS Safari、Android Chrome、原生触控横滑、地址栏伸缩、安全区、软键盘、200%文字、系统reduced-motion未验；浏览器精确版本未提供。鼠标/键盘和桌面视口不能代替这些证据。
- 导出/导入系统文件选择器本轮未复验；旧格式继续、实际存档桥保存/刷新、迁移规则测试已验证。完整原生文件对话框流程仍待验收。
- 未执行线上验收/部署；测试服务收尾停止。最终冻结版可交给发布统筹按既定双站流程继续，是否上线由其结合未验证项判断。
