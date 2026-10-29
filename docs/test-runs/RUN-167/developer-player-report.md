# LOL 选手生涯 v1.5.0 本地交付

日期：2026-10-30。仅修改本游戏，未修改 LOL 经理、生产平台或旧冻结版本。未发布线上站点。本次交付合并同页比赛／快速模拟与评分／成长修整。

## 构建与修改

- 源码：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/src/`
- 历史配置：`assets/history/rating-anchors.json`、`supplements.json`；生成器 `scripts/build-history.py`，新 S 赛抓取器 `scripts/fetch-worlds.py`。
- 完整构建：`/Users/leizhang/Documents/ChatGPT/shoota/lol-player/dist/lol-player.html`；`dist/index.html` 与其字节一致。
- SHA-256：`ad800c9eb2280a8a9da17f6f5abc50079be93a427c85d2ac5772dd8ce4117183`，4,405,236 字节。
- 构建命令：`python3 scripts/build-history.py` 后 `python3 scripts/build.py`。
- 用户预览 `http://127.0.0.1:8776/` 的 `build.json` 已核对为同一指纹。没有导入测试档到该来源、没有修改用户存档。
- 主要代码：`app.js/style.css` 同页工作区、稳定顶栏与 1/5 场模拟；`engine.js/badges.js` 成长节奏；`eras.js/career.js` 潜力、年龄和旧档迁移；`history-data.js` 生成数据。

比赛日、进行中比赛、复盘留在主页工作区；5 场指五轮完整系列赛，包含已有比赛余下部分，不重新开局刷结果。自动跳过无本队比赛轮次；到赛季末不足五场时给出实际完成数量，合同选择处停止，不自动签约。按钮防重复／过时点击。

评分、数据方法与成长参数见 `RATING-CALIBRATION.md`。早期高潜减少，同时恢复欧美在对应强势年份的个人评价。

## 自动测试

本次最终源码执行通过：

| 测试 | 覆盖 |
| --- | --- |
| `scripts/rating-calibration.cjs` | 2014–2027 Faker POT99、2015 EDG 逐人能力与首发、旧档生涯成长／合同／玩家能力／进行中比赛快照保留、评分迁移幂等、已验证年龄修正 |
| `scripts/worlds-ratings.cjs` | 12 届正赛、同位置证据与评分范围、G2/FNC/C9 代表年份、早期高潜数量、位置与年龄 |
| `scripts/growth-balance.cjs` | 3 个完整赛年旧新对照、5 年龄档常规／早熟／替补对照、90+减速、虚拟高潜稀缺、同轮训练去重、保存恢复 |
| `scripts/inline-match.cjs` | 同页推进、重复／过时点击、已有手动比赛续算、替补成长、旧直播档、5场精确结算与持久化、合同停点、季末不足5场汇总 |
| `scripts/selection.cjs` | 五位置综合首发评估 |
| `scripts/player-perspective.cjs` | 五位置选手视角、POT98→100、训练与恢复、比赛中教练战术值不影响结果 |
| `scripts/identity-prospects.cjs` | 真实身份与位置、16岁市场门槛、虚拟命名、2026前后生成分布 |

结果：`output/growth-v1.5.0/` 的日志和 `balance-results.json/worlds-checks.json`；`output/inline-match-v1.5.0/rating-tests.json/test.log`。UI 约束静态扫描 `ui-scan.json` 为 P0/P1/P2 各 0，不代替浏览器测试。

三种种子每种模拟一个完整 2015 赛年：旧16岁78能力结束92/91/92；最终版81/81/81。不是三年连跑，也不代表所有生涯的固定结局。潜力分布与训练对照详见原始 JSON。

## 真实浏览器验证

使用 IAB 后台独立 QA 标签，平台副本 `http://127.0.0.1:8808/#play-lol-player` 的真实 iframe 与可见存档恢复入口。未操作用户的 8776 标签。仅用 UI 点击／填写恢复文本，不通过浏览器直接改游戏状态。

最终 `ad800c9e…` 构建证据均在 `output/inline-match-v1.5.0/browser/`：

- `worlds-final-overseas.png`：2019 G2 个人91–94、不同POT；Perkz/Wunder/Mikyx21岁、Rekkles23岁；另在DOM核对Doublelift26岁。
- `worlds-final-caps.png`：展开个人评分来源，S9正赛18局、KDA3.37、GD15约200，初值与生涯变化分开。
- `growth-final-profile-phone.png`：16岁玩家能力78、POT98；实际五轮12小局后经验8.2/16、年度空间最多+3，未把潜力直接计入能力。
- `growth-final-{视口}.png/json`：360×640、390×844、430×932、844×390、768×1024、1366×768、1440×900七档，实际点击五场→5/5汇总。根节点宽度等于视口宽度，主操作44px高，竖屏底部导航、横屏侧栏。iframe有效高度比宿主少49–50px，记录在JSON中。
- 390×844刷新后5/5汇总仍存在；无控制台warning/error，见`growth-final-console.json`。

前序同版本迭代证据：`final-manual-390x844.png`、`final-phone-five.png` 在最终成长／生日数据更新前验证“手动比赛03:00→去中路支援→05:00→接着模拟五场”；`final-season-stop-fixed.png` 验证季末1/5汇总→完成赛季→合同处理。它们是中间构建证据，不声称为最终指纹；最终源码自动测试覆盖这些边界。其他早期截图保留作回归记录。

## 存档兼容与未验证项

v1格式保留；评分、成长、虚拟人才、生日各自一次性迁移。真实选手修正初值并保留已发生的成长，玩家属性不被评级覆盖；经验按旧门槛进度换算，旧赛果、薪资合同、LIVE能力快照不重算。已经成长过高的旧档不会直接压回新开局能力，因此可能仍比同年新档强。

已知遗留：历史赛季模拟BP仍可能选到该年尚未发布的英雄（本次2019复盘看到永恩／佛耶戈）。这不属于本轮评级和成长修整，未把历史版本完整一致性标为通过。欧美可选战队目录仍是代表队而非全部联赛；2026世界赛完整证据未覆盖。

未验证：实体iOS/Android、真实软键盘、200%缩放、所有年份完整生涯、生产站缓存与部署。未将本次本地验收写成正式上线验收，也未使用旧冻结脚本中不适用的发布通过声明。
