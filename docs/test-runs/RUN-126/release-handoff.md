# 舱位入口修复与上线前验收交付 · 36c5f6fc47a3

## 结论与范围

原78239468cadd存在的舱位入口阻碍已在本版修复；不能发布原版代替本版。发布统筹已在本对话明确要求定点修复并重新冻结。本版未部署，平台真实文件未修改。

相比782，游戏源码变更dist/app.js与dist/style.css：声明缺失的cabinRoute=null，在加载/恢复存档时清空UI上下文，为舱位编辑加独立样式类，并在短横屏将预设和座位字段排为两列。没有修改玩法、费用、座位规则或经营算法。核查航线列表、两点排班和机队直接入口，三条路径共享该状态；直接机队入口原有清空逻辑现正常执行，保存后不会误返回上一条航线。新增 tests/cabin-entry.test.cjs。

客流增长与滚动检修完整保留，说明见原782交付记录。此前性能数据仍适用相同engine/automation字节：400架周经营热运行中位95.4ms，冷启动227ms；不宣称全操作100ms。

## 完整产物与指纹

- 工作源码：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/dist
- 冻结源码：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-27-36c5f6fc47a3/source
- HTML：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-27-36c5f6fc47a3/云际航空.html
- ZIP：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-27-36c5f6fc47a3/云际航空-离线版.zip
- HTML SHA256：36c5f6fc47a3d013fd175e6e39a2668b9df1af5751f8ba6467faa054f575b5a1
- ZIP SHA256：962119bb990c7e1c603a238a825288a377532307ed5f6bfbfc1bc5c1535796d8
- 根HTML、临时平台实际载入HTML、冻结HTML一致；根ZIP与冻结ZIP一致。冻结源文件与工作源码逐文件一致。临时独立目录重建HTML字节一致，ZIP内部HTML一致。
- 平台：2c0fadb83eee6ec39fec6b870119c07d39f69aaa，读取 /Users/leizhang/Documents/shoota/tmp/wt-portrait/public；隔离副本在 /Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/platform-782-qa/public。平台index SHA256为 cca8fe4a90cfdcfc042123b53506114c43b90f446fa98099300858f33be1c061，原文件与副本相同。

## 源自缺陷：失败→修复→成功

原版真实浏览器：390×844，新开局→四川省→成都天府→航线网络→任一航线“舱位管理”，连续点击无弹窗，ReferenceError: cabinRoute is not defined。保存原版BLOCKER.md、截图、console日志，见evidence/original-782-failure-and-matrix。

同一回归测试使用CABIN_APP_SOURCE指定原782源码：3项全失败，均ReferenceError；修复后3项全通过。测试运行真实点击/表单分支及routeCabins/cabinModal函数，不预先注入缺失状态；覆盖窄/宽机分页、实际座位与费用保存、原航线归属保持、保存后返回原航线、机队入口清空路线上下文。它是逻辑补充，浏览器结果另列。

完整298项回归全部通过；见evidence/final-platform-2c0fadb/tests.txt及本目录frozen-tests.txt。

## 当前构建真实浏览器验收

环境：IAB桌面浏览器，平台本地隔离127.0.0.1:8928，默认字号/100%视口，窗口尺寸模拟手机，不冒充真机。仅使用自造夹具及隔离本机存档。浏览器具体引擎版本未由工具返回。

最终构建matrix.json包含84组布局状态：主界面、航线编辑、舱位编辑、结算，各21种外层视口。标准七尺寸360×640、390×844、430×932、844×390、768×1024、1366×768、1440×900；补320×568、390×600，以及700/701、1100/1101、600/601、959/960、370/371宽度两侧，844×550/551（游戏iframe扣去平台50px后正好跨500px高度断点）。每组实际切屏、读取DOM边界及截图，根元素无横向溢出，主推进/提交位于可视区，弹窗没有出界。短横屏844×390实际查看宽体三舱全部4个字段均可见；320×568允许主体局部滚动，实际点击头等舱字段后滚动至可视区，固定操作区保留（320-controlled-scroll.png）。长报价/收支明细允许模态框主体局部滚动。航线草稿8与舱位草稿跨尺寸不丢。

实际流程及证据按版本区分：
- 最终36c5构建：360×640、390×844、1366×768各重置隔离夹具，航线舱位列表→A320neo两舱→报价→实际保存156经济/12商务→返回原航线→经营W1到W2→汇总，见final-core-flows.json及final-summary截图。844×390宽体A350-1000三舱旗舰302/36/8全部字段可见，118万元报价、实际保存返回原列表，见844-final-cabin-review/applied.png。
- 最终36c5构建：四类界面×21视口重测，matrix.json的84项均取最终构建最后一次记录；舱位字段详情单存cabin-fields-final.json。320×568实际局部滚动的字段可达性已核验，非全字段一屏承诺。
- 最终36c5构建：刷新平台显示“已读取存档”、W2，航线舱位仍156经济/12商务；见final-refresh.txt及final-cabin-entry.png。控制台错误为空，console-errors.json。
- 相邻功能在99fa9c01e911候选版完成：两点排班入口、机队直接入口、宽窄体保存返回；实际五周推进W2→W7，剧情处理后继续，刷新W7，见saved-after-batch.json/reload-week7.png。搜索美国航空单条、无匹配为空、清空恢复152项，实际连续翻至76页，下一页禁用；北京机场显示首都PEK与大兴PKX。此次最终版仅增加舱位编辑样式类和短横屏CSS，与这些功能无关。上述旧候选证据保留并明确不冒充最终构建重测。
- 原782完成新开局→四川省→成都天府→航线7改8→W2，见original-782-failure-and-matrix；本轮新开局未再重复。原版舱位失败证据保留。
- 客流增长/滚动检修四尺寸真实流程及七视口证据沿用782，同一engine/automation字节；本轮未改相应逻辑和样式，详见 ../2026-10-27-78239468cadd/release-handoff.md。

## 存档、非阻断项与未验证项

存档版本1/revision4及存储格式不变。cabinRoute是内存UI上下文，不加入存档；最终构建座位调整和W2刷新已实测；W7连续推进刷新为99候选版相邻证据。旧JSON/大型打包存档迁移与本机备份沿用782同版引擎和save.js证据。平台本来只有本机存档，云档不适用，不作为缺陷。

非阻断文案：客流榜搜索无匹配显示“尚无运营客流，先开航并完成一次经营”，实际只是搜索结果为空；清空后恢复。未按未授权范围扩展改文案，交发布统筹知悉。

明确未验证：iOS Safari/Android Chrome真机、系统软键盘遮挡、200%文字缩放。工具当前只有桌面视口调整，不能把缩小视口当文字放大或真机键盘。生产/测试站实际上传及线上旧档复用由发布统筹执行。故结论为：本地实际平台可用环境的验收项通过，原舱位阻碍解除；真机/系统项待验收，不宣称所有设备已完成验收。
