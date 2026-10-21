# shoota 部署手册

## 1. 环境信息表

| 项 | 值 |
| --- | --- |
| 部署目标 | `paas` |
| 平台 | Cloudflare Workers 静态资源 · Worker `changju` · 账号 ID `627a6218f132dffc9cb22dd50c2fe1a6`（Bearisbug 的 Cloudflare 账号） |
| 发布策略 | 平台内建（paas）：新版本上传完再整体切换，切换无停机 |
| 域名 | https://shoota.ai （根域，Worker 自定义域名；workers.dev 与预览地址已关闭） |
| DNS | Cloudflare，shoota.ai zone；根域这条记录由 Worker 自定义域名自动创建和维护，不要手改。`www.shoota.ai` 由 zone 的 Redirect Rule 301 跳到 `https://shoota.ai`，路径和参数原样保留，浏览器会带上 `#` 后面的部分；它的 DNS 记录是橙云的 `AAAA 100::` 占位、没有源站。这两项不在 `wrangler.jsonc` 里，在 Cloudflare 面板 shoota.ai → Rules → Redirect Rules 管理。www 不能改成直接显示网站：存档按域名隔离，www 和根域会成两份互不相通的进度。同理 http 一律 301 到 https，由同一处的第二条 Redirect Rule 负责，只放行存档搬家页 `/move`、`/move.html`；这条规则保留到 2026-11-21，之后删掉它、重新打开 SSL/TLS → Edge Certificates 的 Always Use HTTPS。在那之前不能开 Always Use HTTPS 或 HSTS：它们会把 `/move` 也跳到 https，浏览器会被记成查过了，http 下的旧存档再也搬不回来。规则表达式里判断 http 用 `not ssl`，这个套餐不认 `http.request.scheme`。在 CI 里部署时，wrangler 会直接覆盖与配置域名冲突的 DNS 记录、不提示，往 `wrangler.jsonc` 加域名前先确认该主机名上没有在用的记录 |
| 健康检查 | 请求 https://shoota.ai/ 。身份断言：首页含 `<title>shoota 游戏平台</title>`。版本断言：`public/` 下每个文件与本次提交逐字节一致。另外断言 `/kanban` 返回看板登录页、`POST /api/e` 对空上报返回 400，证明 Worker 脚本在线且不写数据。没有回显三元组的健康端点，用内容比对代替 |
| CI | GitHub Actions `.github/workflows/deploy.yml`：`check`（质量门）→ `deploy`（数据库迁移、部署、健康检查、失败回滚）；PR 只跑 `check` |
| 数据库 | Cloudflare D1 `shoota-metrics`（亚太），Worker 里的绑定名 `DB`，表结构在 `migrations/` |
| 看板 | https://shoota.ai/kanban ，密码见第 5 节；统计口径见 `docs/DESIGN.md` |
| 服务器 / 应用目录 / 镜像 / 端口 / 反代 | N/A（没有自管服务器） |
| Synco 编排 | 未挂接（paas 目标不走 Synco 部署方式） |

## 2. 日常发布

push 到 `main` 即自动发布：质量门 `node scripts/check.mjs` → 记下当前线上版本号 → `wrangler d1 migrations apply` 执行新迁移 → `wrangler deploy` → 健康检查（最多重试 12 次，每次间隔 10 秒）→ 不通过就 `wrangler rollback` 回到部署前的版本，并把 run 标成失败。进度在仓库 Actions 页看，每次发布也会出现在仓库 Environments 页的 `production` 下。手动重跑：Actions 页 → deploy → Run workflow。

上线前提：改动已在本地过一遍 README「本地预览」里的流程，并且 `node scripts/check.mjs` 通过。

## 3. 查日志 / 排障

- **部署日志**：Actions 里对应 run 的 `deploy` job。每一步失败的原因都写在日志里：质量门列出出错的文件和段落；健康检查列出不一致的文件路径。
- **线上版本历史**：`npx wrangler@4.151.1 deployments list --name changju`，每个版本的 message 以 commit 短哈希开头。
- **当前线上版本**：`npx wrangler@4.151.1 deployments status --name changju`。
- **游戏打不开**：先看 `https://shoota.ai/games/<id>.html` 是否返回 200，再看 `CATALOG` 里的 `src` 是否和文件名一致。本地双击打开 `index.html` 时游戏一定打不开（`fetch` 不支持 file://），这不是线上问题。
- **看板打不开或数字异常**：先看 `https://shoota.ai/kanban` 能否出登录页；能出登录页但登录后读取失败，到 Cloudflare 面板 Workers → changju → Logs 看报错，按 `docs/DESIGN.md` §22 处理。
- **看板登录被锁**：同一网络连错 5 次锁 15 分钟，等到期，或按第 6 节查询命令删掉 `login_guards` 里的记录。
- **玩家说进度没了**：进度只存在玩家自己的浏览器里，换设备、换浏览器、清缓存都会丢。让玩家用站内「存档」页的存档码迁移；平台侧没有数据可以恢复。
- 以上命令都要先设置 token：`export CLOUDFLARE_API_TOKEN=$(bw get password CHANGJU_CI_DEPLOY_TOKEN)`。

## 4. 回滚

```bash
export CLOUDFLARE_API_TOKEN=$(bw get password CHANGJU_CI_DEPLOY_TOKEN)
npx wrangler@4.151.1 deployments list --name changju          # 找到要回到的版本号
npx wrangler@4.151.1 rollback <版本号> --name changju -m "回滚原因" -y
```

回滚只回退 Worker 版本，不回退 D1 数据库：迁移只新增表或列，旧版本照常可用；数据要回到某个时刻按第 6 节恢复。回滚只改线上，不改 git。下一次 push main 会把 `main` 的内容重新发上去，所以回滚之后还要 `git revert` 出问题的提交，否则坏版本会被再次发布。

CI 的自动回滚目标是「本次部署前的线上版本」。只要每次失败的部署都回滚成功，它就是最后一次通过健康检查的版本。如果连回滚这一步也失败了（run 日志里 rollback 步骤报错），就按上面的命令手动回到最后一个健康版本。

回滚后在第 10 节登记一行。

## 5. 密钥清单

| 层 | 键名 | 用途 |
| --- | --- | --- |
| GitHub Secrets | `CLOUDFLARE_API_TOKEN` | CI 部署与回滚。Cloudflare 账号级 token `changju-ci-deploy`，权限：账号的 Workers Scripts Write 与 D1 Write，shoota.ai 的 Workers Routes Write 与 Zone Read。同值存在 Bitwarden 条目 `CHANGJU_CI_DEPLOY_TOKEN` |
| Worker 加密变量（wrangler secret） | 见项目根 `.env.example` | 看板密码与签名密钥，只在 Cloudflare 里，仓库里没有值 |

账号 ID 不是密钥，直接写在 `wrangler.jsonc` 的 `account_id`。

**看板密码与签名密钥**（Worker 加密变量，设置后对之后的每个版本都生效，不随部署丢失）：

- 设置或更换看板密码：`printf '%s' "$(bw get password SHOOTA_KANBAN_PASSWORD)" | npx wrangler@4.151.1 secret put KANBAN_PASSWORD`。换密码先在 Bitwarden 改条目，再执行这一行。
- 设置或轮换签名密钥：`openssl rand -hex 32 | tr -d '\n' | npx wrangler@4.151.1 secret put KANBAN_SECRET`。轮换后所有人的看板登录态立即失效，要重新输密码。
- 核对：`npx wrangler@4.151.1 secret list` 能看到两个键名。

**轮换 token**：在 Cloudflare 新建同权限的 token → `bw edit` 更新 `CHANGJU_CI_DEPLOY_TOKEN` → `bw get password CHANGJU_CI_DEPLOY_TOKEN | gh secret set CLOUDFLARE_API_TOKEN -R Bearisbug/changju` → 在 Actions 页手动 Run workflow 验证 → 删除旧 token。有协作者离开时也要轮换：仓库写权限能读到这个 Secret。

## 6. 数据库备份与恢复

统计数据在 Cloudflare D1 `shoota-metrics`。玩家的游戏进度不在这里，只存在玩家自己的浏览器，靠站内「存档」页的存档码自己备份。以下命令都先设置 `export CLOUDFLARE_API_TOKEN=$(bw get password CHANGJU_CI_DEPLOY_TOKEN)`，并在项目根执行。

- 备份方式与频率：D1 自带时间点恢复，免费版可回到最近 7 天内任意时刻，不需要另配定时备份。
- 手动立即备份：`npx wrangler@4.151.1 d1 export shoota-metrics --remote --output shoota-metrics-$(date +%F).sql`，导出文件不入仓。
- 查当前时间点书签：`npx wrangler@4.151.1 d1 time-travel info shoota-metrics`；做有风险的操作前先记下它。
- 恢复步骤：`npx wrangler@4.151.1 d1 time-travel restore shoota-metrics --bookmark <书签>`，或用 `--timestamp <Unix 秒>`。不要加 `-y`，这个命令不认，非交互环境会自动确认。恢复会丢掉该时刻之后写入的全部统计，输出里会给出撤销用的书签。恢复后登录看板核对概览数字。
- 查询或删改个别行：`npx wrangler@4.151.1 d1 execute shoota-metrics --remote --command "<SQL>"`。
- 迁移执行点：CI 在部署前执行 `wrangler d1 migrations apply shoota-metrics --remote`。迁移文件只新增表或列，旧版本 Worker 照常可用，所以回滚 Worker 时不回退数据库。确实要删改表结构时，先停下与负责人确认停机窗口。
- 演练记录：2026-10-20 在临时库 `shoota-metrics-drill` 上演练过时间点恢复与导出，结果见第 10 节，临时库已删除。

## 7. 手动部署兜底（CI 不可用时）

```bash
export CLOUDFLARE_API_TOKEN=$(bw get password CHANGJU_CI_DEPLOY_TOKEN)
npx wrangler@4.151.1 deployments status --name changju          # ① 记下当前版本号，出问题时回滚用
node scripts/check.mjs                                           # ② 质量门
npx wrangler@4.151.1 d1 migrations apply shoota-metrics --remote             # ②b 数据库迁移，没有新迁移时什么都不做
npx wrangler@4.151.1 deploy --message "$(git rev-parse --short HEAD) manual"   # ③ 部署
curl -fsSL https://shoota.ai/ | grep -c '<title>shoota 游戏平台</title>'   # ④ 身份断言，应输出 1
for f in $(cd public && find . -type f | sed 's#^\./##'); do                    # ⑤ 逐文件比对，无输出即全部一致
  p=$f; [ "$f" = index.html ] && p=""
  [ "$(shasum -a 256 < public/$f | cut -d' ' -f1)" = "$(curl -fsSL "https://shoota.ai/$p?v=$RANDOM" | shasum -a 256 | cut -d' ' -f1)" ] || echo "不一致：/$p"
done
```

④ 或 ⑤ 不通过，就用 ① 记下的版本号按第 4 节回滚。

## 10. 变更记录

| 日期 | 事件 | 记录 |
| --- | --- | --- |
| 2026-10-18 | 首次上线（手动） | 单文件版（平台 + 6 款游戏 base64 内嵌）手动部署到 Worker `changju`，绑定 changju.kaivia.ai |
| 2026-10-18 | 建仓与管线 | 拆成 `public/index.html` + `public/games/*.html`，F1 移到商店第一位；建 GitHub 仓库 Bearisbug/changju，push main 自动部署 |
| 2026-10-18 | 回滚演练 | 手动 rollback 到 1a400272（单文件版）再恢复到 258e54c3，线上内容随之切换，恢复后 7 个文件与仓库一致 |
| 2026-10-18 | 失败路径演练 | 07b2bb9 故意漏传 yike.html，run 39104526094 健康检查未过、自动回滚到 258e54c3；revert 为 bddcf06 后重新部署通过 |
| 2026-10-19 | 域名切换 | 自定义域名从 changju.kaivia.ai 换成 shoota.ai 根域（run 39233228289），旧域名已解绑、解析已删；CI token 的 zone 权限同步从 kaivia.ai 换成 shoota.ai，收紧后手动部署 run 39233424468 通过。浏览器存档按域名隔离，玩家在旧域名上的进度不会带到 shoota.ai |
| 2026-10-19 | www 跳转 | `www.shoota.ai` 的 Namecheap 停放页 CNAME 改为橙云 `AAAA 100::`，加 Redirect Rule 301 到 `https://shoota.ai`（保留路径与参数）；固定连 Cloudflare 节点实测 https/http、带路径、带参数 4 种访问都正确跳转，Edge 打开 `https://www.shoota.ai/#game-f1` 落在 `https://shoota.ai/#game-f1` |
| 2026-10-20 | 数据库恢复演练 | 临时库 `shoota-metrics-drill`：写入 A → 记书签 → 写入 B → 按书签恢复后只剩 A；导出 SQL 文件成功；演练后删除临时库 |
| 2026-10-21 | 强制 https | shoota.ai 开启 Always Use HTTPS；实测 `http://shoota.ai/`、`http://shoota.ai/kanban`、`http://www.shoota.ai/` 都 301 到对应的 https 地址，https 首页 200。没有加 HSTS |
| 2026-10-21 | http 跳转放行搬家页 | 先加 Redirect Rule：`(http.host eq "shoota.ai" and not ssl and not http.request.uri.path in {"/move" "/move.html"})` 301 到 `concat("https://shoota.ai", http.request.uri.path)`，保留参数；再关 Always Use HTTPS。实测 http 的 `/`、`/kanban`、带参数的游戏路径都 301 到对应 https 地址，`/move`、`/move.html` 不跳，www 跳转不变，https 首页 200。之后推送 2a1ea03 上线搬家页 |
