# 经营提醒优先级与推进提速交付记录

工作源码：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/dist

构建入口：/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/build-local.py

变更：发展消息优先于延误/运行清单；多周运行报告合并。机场索引、轻量排行榜档案、排班同向机场对查找和快进初始渲染减少重复计算。未更改经济规则、延误概率、口碑数值或排班结果。

[验收报告](evidence/report.md)。249项测试通过；2/80/160架各15周与旧版完整状态相同。冻结源码重建HTML与根目录HTML、ZIP内HTML指纹一致。历史存档继续使用，版本与修订号不变。

```json
{
  "version": "2026-10-26-d6df70d39527",
  "scope": "经营发展动态优先；多周运行清单合并；经营计算提速（不改经营数值）",
  "html": "/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-26-d6df70d39527/云际航空.html",
  "htmlSha256": "d6df70d3952729d116ab03dd6abb646d7dcae556f3a208ccf3ae0c501a411757",
  "zip": "/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-26-d6df70d39527/云际航空-离线版.zip",
  "zipSha256": "20e186172ce433b67bb05cfeceed20d62378f368f8d048497a69dd7208e5f05c",
  "source": "/Users/leizhang/Documents/ChatGPT/shoota/airline-empire/output/releases/2026-10-26-d6df70d39527/source",
  "sourceManifestSha256": "434edb230d840f4c511a6f962eae07fed07dfbe11ff36f240e1faf3281a84127",
  "tests": {
    "pass": 249,
    "fail": 0
  },
  "saveCompatible": true,
  "published": false,
  "fullReleaseViewportAcceptance": "pending",
  "focusedBrowserFlows": "passed; news priority, delivery, merged operating notices, 4-viewport five-week advance and 7-viewport notice checks"
}
```

尚未发布；请与机场版57e5的发布任务分开。本版包含其1040机场数据，57e5冻结目录与证据未修改。受影响桌面内嵌浏览器流程通过，完整上线矩阵与真实移动设备待验收。
