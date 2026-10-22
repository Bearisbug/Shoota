# shoota 上线清单

操作手册见 `docs/DEPLOY.md`；本清单管上线期打勾与决策记录。执行者：**A**=Agent，**U**=用户，**A+U**=Agent 做、用户复核。

## 1. 密钥配置清单

| 键名 | 配到哪 | 来源 | 配置动作（零回显） | 验证 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets（Bearisbug/changju） | 生成：Cloudflare 账号级 token `changju-ci-deploy`，2026-10-20 加了 D1 Write，已录入 Bitwarden 条目 `CHANGJU_CI_DEPLOY_TOKEN` | A：`bw get password CHANGJU_CI_DEPLOY_TOKEN \| gh secret set CLOUDFLARE_API_TOKEN -R Bearisbug/changju` | `gh secret list -R Bearisbug/changju` 见键名；首次 Actions 部署成功 | ☑ 2026-10-18：secret list 见 `CLOUDFLARE_API_TOKEN`；run 39104230080 部署成功 |
| `KANBAN_PASSWORD` | Worker 加密变量 | Bitwarden 条目 `SHOOTA_KANBAN_PASSWORD`，值由老板指定 | A：`printf '%s' "$(bw get password SHOOTA_KANBAN_PASSWORD)" \| npx wrangler@4.151.1 secret put KANBAN_PASSWORD` | `npx wrangler@4.151.1 secret list` 见键名；线上 TC-008 用该密码能登录 | ☑ 2026-10-20：secret list 见键名；RUN-003 TC-008 登录通过；2026-10-22 测试站 `changju-test` 另设，Bitwarden 条目 `SHOOTA_TEST_KANBAN_PASSWORD`，登录实测通过 |
| `KANBAN_SECRET` | Worker 加密变量 | 生成，不入 Bitwarden | A：`openssl rand -hex 32 \| tr -d '\n' \| npx wrangler@4.151.1 secret put KANBAN_SECRET` | `secret list` 见键名；线上 TC-010 改签名的 cookie 被拒 | ☑ 2026-10-20：secret list 见键名；RUN-004 TC-010 改签名被拒；2026-10-22 测试站 `changju-test` 另生成一份，secret list 见键名 |

## 2. 部署步骤清单

- [x] 1. 盘点完成、本清单建档、§1 密钥表列全（A）· 验证：§1 无缺行 · 2026-10-18
- [x] 2. 健康检查口径（A）· 验证：静态站没有健康端点，改为首页身份断言 + `public/` 逐文件内容比对；本地用 `bash -eo pipefail` 跑同一段脚本，线上内容不一致时报文件路径、访问别的站时报身份断言失败 · 2026-10-18 已实测两种失败输出
- 2b / 3 / 4. N/A（paas 目标：没有自管服务器、容器槽和宿主端口）
- [x] 5. 产物生成（A）· 验证：`bash check.sh <项目根>` 绿 · 2026-10-18
- [x] 6. §1 密钥全配齐（A）· 验证：§1 全部 ☑ · 2026-10-18
- [x] 7. 首次部署真跑通（★A1；A）· 验证：push main 触发的 Actions run 全绿，健康检查日志显示身份断言通过、全部文件与该提交一致 · 2026-10-18 run 39104230080：线上版本 1a400272 → 258e54c3，第 1 次检查通过，7 个文件与 d51b61c 一致
- [x] 8. 线上冒烟一轮（★P2；A）· 验证：§5 的最小冒烟集在 https://changju.kaivia.ai 上逐条通过并登记 · 2026-10-18 RUN-1
- [x] 9. 回滚演练（★A3；A）· 验证：按 DEPLOY.md 第 4 节手动回滚到上一版本，线上内容随之变化，再恢复到最新版本 · 2026-10-18：rollback 到 1a400272 后首页 2,655,759 字节（单文件版），恢复到 258e54c3 后 72,099 字节，7 个文件与仓库一致
- [x] 9c. 失败路径（P4；A）· 验证：推一个健康检查必然不通过的提交，run 自动回滚、线上回到之前的版本；验完 revert · 2026-10-18 run 39104526094：07b2bb9 用 `.assetsignore` 漏传 yike.html，部署出 4a9c5dfd，健康检查 12 次未过，自动回滚到 258e54c3；revert 后 run 39104744918 全绿
- [x] 11. 交付自查（A）· 验证：check.sh 绿 + CHECKLIST 通用节与 A 节逐项过 + AGENTS.md「部署」段已写入 · 2026-10-18

## 3. 提速优化菜单（可选；默认全不做）

- [ ] 游戏文件长缓存：构建按内容摘要另出 `/g/<id>-<摘要前 8 位>`，`public/_headers` 给 `/g/*` 与 `/assets/*` 配 `Cache-Control: public, max-age=31536000, immutable`，浏览器里再由 Service Worker 缓存 · 收益：回访玩家不用重新下载游戏文件（弱网下旧版再开薯光 19.4 秒，目标 ≤ 2 秒）· 代价：多一个构建步骤，游戏文件在 `dist/` 里有两份 · 2026-10-22 用户按 ADR-009 定下做，重写版已实现，本地 wrangler dev 实测两类地址的响应头为一年 immutable、br 压缩；上线后用 `curl -sI -H 'accept-encoding: br' https://shoota.ai/g/<id>-<摘要>` 复核再打勾

## 4. 遗留与例外登记

| 日期 | 事项 | 说明 |
| --- | --- | --- |
| 2026-10-18 | CI 认证用 GitHub Secret，没有用平台 Git 集成 | paas 目标默认让平台直连 GitHub、不在 GitHub 放密钥。这里改用 GitHub Actions 加专用 token：协作者能在 Actions 页看到完整的部署日志和失败原因，还能在 CI 里做健康检查和自动回滚。代价：仓库写权限能读到这个 token（可以写一个 workflow 把它打印出来）。缓解：token 只有账号级 Workers Scripts Write 和 shoota.ai 的 Workers Routes Write / Zone Read，没有 DNS、Pages、R2、计费和其他 zone 的权限；账号里目前只有 `changju` 一个 Worker。协作者离开时按 DEPLOY.md 第 5 节轮换 |
| 2026-10-18 | 健康端点三元组改为内容比对 | 纯静态站没有能回显 service/slot/version 的端点；身份用首页 title 断言，版本用逐文件 sha256 与提交比对 |
| 2026-10-18 | 自动回滚目标是部署前的线上版本 | 每次失败都回滚成功时，它就是最后一次健康的版本；回滚步骤本身失败时 run 报错，按 DEPLOY.md 第 4 节手动处理 |
| 2026-10-18 | 测试文档缺失，以最小冒烟集替代，未经用户确认 | 冒烟集见 §5 |
| 2026-10-18 | 协作者由用户在网页上邀请 | 用 stonesjjj@gmail.com 在 GitHub API 查不到用户，API 只能按用户名邀请；用户在 Settings → Collaborators 用邮箱邀请 |
| 2026-10-20 | 统计与看板按用户「直接改完直接推」上线，设计文档未经逐项确认 | `docs/DESIGN.md` 保持「评审中」，三条 ADR 为 Proposed，等用户签字；实现完全按文档当前写法 |
| 2026-10-20 | 统计与看板的用例改由 `docs/TEST.md` 管 | 本文件第 5 节只管平台已有功能的最小冒烟集 |
| 2026-10-21 | shoota.ai 开启 Always Use HTTPS，http 请求一律 301 到 https | 浏览器把 http 与 https 当成两个站点，存档各存一份；开启后只剩 https 一份。代价：开启前只用 http 打开过平台的玩家，进度留在 http 那份里，之后看不到。没有加 HSTS，要撤回时在 zone 的 SSL/TLS → Edge Certificates 关掉即可 |
| 2026-10-22 | 重写版健康检查不比对 `dist/kanban/` 与 `_headers` | 看板页要验过会话才返回、登录页会填入提示文字，`_headers` 由平台读走不对外提供，三者无法逐字节比对；改为断言 `/kanban` 返回登录页，并加断言 `POST /api/launch` 返回 400，认出新 Worker |
| 2026-10-22 | 重写版引入 Service Worker | 回滚到没有 `/sw.js` 的旧版本时，装过它的浏览器第二次打开才换到旧版；要立即停用需发一版只做注销的 `sw.js`，见 DEPLOY.md 第 4 节 |
| 2026-10-22 | 重写版的手机全屏、iPhone 主屏幕应用、微信引导未经真机验证 | 本机只能用 UA 与安全区模拟；真机用例 TC-PLAY-008～TC-PLAY-011、TC-PLAY-020 登记为待人工，上线前由有设备的人按 TEST.md §3「真机」补测 |
| 2026-10-21 | 强制 https 改为跳转规则，放行搬家页 `/move` | 关掉 Always Use HTTPS，改用 Redirect Rule 把 http 301 到 https，只放行 `/move`、`/move.html`，让 https 页面能去 http 下取回旧存档。保留到 2026-11-21，之后删掉规则、重新打开 Always Use HTTPS；期间不能开 HSTS。步骤见 DEPLOY.md 第 1 节 |

## 5. 最小冒烟集（线上可跑）

| 编号 | 步骤 | 预期 |
| --- | --- | --- |
| S1 | 打开 https://shoota.ai | 商店显示 13 款游戏，精选默认是薯光，「全部游戏」依次为薯光、F1-Driver、F1-Team Principal、篮球巨星、我要当首富、斗罗·万相、重生之我是夜宵摊摊主、后宫生死簿、NBA-经理、CBA-经理、lol电竞经理、一克之差、杀穿娱乐圈 |
| S2 | 点 F1 →「开始游戏」 | 游戏画面铺满窗口，只有一个悬浮按钮；点开它，游戏面板显示「新存档」或「已读取存档」 |
| S3 | 在游戏里产生存档后关掉浏览器，重新打开再进同一款游戏 | 游戏面板显示「已读取存档」，游戏读到之前的进度 |
| S4 | 「存档」页复制存档码，在另一个全新浏览器里粘贴并确认恢复 | 游戏库出现对应游戏，进游戏后进度一致 |
| S5 | 逐个打开另外 11 款游戏 | 每款都能加载出画面，控制台没有游戏运行错误 |

执行记录：

| 轮次 | 日期 | 环境 | 结果 |
| --- | --- | --- | --- |
| RUN-1 | 2026-10-18 | 线上 https://changju.kaivia.ai （@d51b61c，Edge 无头：桌面 1280 宽 + 手机 390 宽） | S1–S5 全部通过；控制台只有浏览器自动请求 `/favicon.ico` 的 404（站点没有图标） |
| RUN-2 | 2026-10-19 | 线上 https://shoota.ai （@dc08c2a，域名切换后，Edge 无头：桌面 1280 宽 + 手机 390 宽） | S1–S5 全部通过；控制台只有 `/favicon.ico` 的 404 |
| RUN-3 | 2026-10-21 | 本地，基于 696f8dd 加三款新游戏 | 桌面 S1–S5 通过；三款新游戏自动/手动保存、统一备份恢复通过。手机视口覆盖未生效，未宣称手机验收通过；详情见 TEST.md RUN-006 |
| RUN-4 | 2026-10-21 | 线上 https://shoota.ai （@1afcf4b，平台换品牌视觉后，Edge 无头：桌面 1280 宽 + 手机 390 宽） | S1–S5 全部通过：两种宽度商店顺序正确、无横向溢出、无控制台错误；S3 关掉浏览器重开后首富第 2 周进度保留，S4 新浏览器恢复后一致；另外 10 款无游戏运行错误。顶栏载入时显示「已读取存档」，游戏随即写一次存档，约 1 秒后变为「已存档 hh:mm」。详情见 TEST.md RUN-009 |
| RUN-5 | 2026-10-21 | 线上 https://shoota.ai （@b3300bb，存档提示与外链修复、看板换品牌视觉、强制 https 后，Edge 无头：桌面 1280 宽 + 手机 390 宽） | S1–S5 全部通过：两种宽度商店顺序正确、无横向溢出、无控制台错误；S3 首富重开后顶栏 4 秒仍是「已读取存档」，第 2 周进度保留，S4 新浏览器恢复后一致；另外 10 款无游戏运行错误。第一次执行时脚本没点首富的「继续这段经营」，S3、S4 读不到进度，补上这一步后重跑通过。详情见 TEST.md RUN-018 |
| RUN-6 | 2026-10-21 | 线上 https://shoota.ai （@2a1ea03，存档搬家与老玩家识别上线后，Edge 无头：桌面 1280 宽 + 手机 390 宽，带内部标记不写统计） | S1–S5 全部通过：两种宽度商店顺序正确、无横向溢出、无页面错误；S3 首富关掉浏览器重开后顶栏「已读取存档」、第 2 周进度保留；S4 存档码在新浏览器恢复后一致；另外 10 款无游戏运行错误。详情见 TEST.md RUN-028 |
| RUN-7 | 2026-10-22 | 测试站 https://test.shoota.ai （@0563344，加测试站后首次部署，Edge 无头：桌面 1280 宽 + 手机 390 宽） | S1、S2、S5 通过：两种宽度商店都是 13 款、无横向溢出、无页面错误，13 款游戏都能出画面；看板用测试站密码登录后数据接口返回 200。S3、S4 没跑：这次只改部署，存档代码与正式站同一份 |
