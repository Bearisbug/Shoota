# 航司排行与旅客体验交付记录 — 2026-10-25

状态：本地开发与受影响流程验收完成；未发布测试站或正式站。完整上线验收仍由发布流程执行。

## 修改范围
- 排名恢复六项固定权重：口碑27、机队18、城市覆盖18、服务20、可靠性12、连续盈利5。
- 机队100架、覆盖100城封顶；以国家/地区+城市去重，同城不同机场、频次和反向重复航线不刷覆盖分。
- 每家航司档案增加品质/规模/资料三个入口，显示原始值、标准分、权重和贡献。
- 29家参考 Skytrax 2026 旅客评价名次校准初始口碑和服务，现实名次与游戏评分分开。可靠性、盈利与未核实规模均为游戏设定。
- 新增40家海外客运航司，剔除13家货运公司，保留151家NPC（52家中国内地、7家港澳台、92家海外）。新增ORY/GYD/BWN支撑对应枢纽。
- 玩家从152名开始，购买服务不直接提高口碑或服务排名分；有实际承运才按当周体验平滑积累服务分。旧档在首次升级前保留原体验基准。
- 延误、错失衔接、在营停航分别影响口碑；运行可靠性保留近期表现。周报展示口碑变化来源。
- 同航路改签按自营/合作航班实际到达时间排序，受余座和预算限制；记录改签去向、等待、赔付与食宿。保障减轻但不清除负面体验。赔付不是现实法规标准。

## 文件与构建
源码目录：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/dist
构建入口：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/build-local.py
完整HTML：/Users/leizhang/Documents/ChatGPT/shoota/云际航空.html
HTML SHA-256：a9c974e546aea8ba6c59cb3ad861eb13f8c5228e4fc9324421524c107db08f12
离线ZIP：/Users/leizhang/Documents/ChatGPT/shoota/云际航空-离线版.zip
ZIP SHA-256：50d731dc03d54c3f2c55f1ca528284f0f0f998d88857edaa43e6e65bd9d8c994
ZIP内HTML与独立HTML逐字节一致。完整源码指纹见manifest.json。未改其他游戏、平台源码或部署配置。

## 验证
- node --test airline-empire/tests/*.test.cjs：149通过，0失败。完整结果 tests.txt。
- 包含所有中国内地基地开局最后一名、升级不刷排名、旧档升级不瞬时加分、100架/100城封顶、六项贡献相加、同城去重、榜单质量排序、海外目录唯一枢纽、延误/停航扣分、可靠性渐进恢复、最早到达改签、预算/座位限制与存档读写。
- 最终HTML通过 localhost:8896 独立页面在真实IAB浏览器操作。7种视口分别点击品质/规模得分，共14个布局记录；均无页面横溢出，固定底部操作处于视口内，分数一致。见layout.json及截图。
- 真实操作：搜索玩家显示152名/30.3分；升级客舱实际扣71.6万，口碑仍56.0、服务分15.0、综合分30.3；经营一周后实际管制导致2个延误航段，口碑56.00→55.98，周报列明+0.07体验/-0.09延误。证据player-start-last.png、upgrade-keeps-score.png、weekly-reputation.png与txt。
- 国际筛选显示92项；搜索并点击新增爱琴海航空，资料/品质/规模可切换；保留搜索筛选。证据overseas-airline.png。
- 航司资料保留机队、总部/运营中心、竞争信息；详情及长周报使用有边界局部滚动，底部按钮固定。320x568和矮屏长内容允许局部滚动，不以缩字或禁用缩放挤入。
- 浏览器控制台无错误/警告，见browser-errors.json。

## 兼容性与未验证项
- 不重置用户现金、航线、机队、服务等级、资质；旧存档兼容，排名按新公式重算，货运航司退出排名。新增serviceExperience可选，旧档按已有承运/满意度衔接。
- 新客运航司也进入现有竞争模型，后续需求预估可能随对手增加而变化。
- 未部署，未对shoota.ai做验收；未做本轮平台内嵌完整矩阵、真实手机硬件触控或全部世界事件长周期平衡验收。
- 本轮没有重新核实所有航司机队和网络规模；用户授权未核实航司按体量估算。

## 资料
- Skytrax排名：https://www.worldairlineawards.com/worlds-top-100-airlines-2026/
- IATA成员目录：https://www.iata.org/en/about/members/airline-list/
- 巴库机场：https://www.airport.az/en/about-us/
- 巴黎奥利机场资料：https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_01_OCT_2026/FRANCE/AIRAC-2026-10-01/html/eAIP/FR-AD-2.LFPO-fr-FR.html
- 文莱民航AIP：https://www.dca.gov.bn/eaip/
