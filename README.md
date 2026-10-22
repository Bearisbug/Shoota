# shoota

文字游戏平台：商店、游戏库、免账号存档与云存档。线上地址 https://shoota.ai

平台、看板与 Worker 用 Vite + React + TypeScript 写，构建产物在 `dist/`，由 Cloudflare Worker 的静态资源提供；统计、启动遥测与云存档存在 Cloudflare D1。设计以 `docs/DESIGN.md` 为准，验收步骤与执行记录在 `docs/TEST.md`。

## 目录

| 路径 | 内容 |
| --- | --- |
| `index.html` | 平台入口。`<head>` 里的搬家检查脚本 moveCheck 必须留在应用脚本之前同步执行，2026-11-21 前不改它的行为 |
| `src/app/` | 平台页面：商店、详情、游戏库、存档页、恢复码；`src/app/player/` 是游戏运行层（启动、两种运行器、计时与上报），`src/app/player-ui/` 是游戏页界面（悬浮按钮、游戏面板、载入页与失败页、引导与旋转提示） |
| `src/catalog/` | 游戏目录 `CATALOG`，顺序就是商店里的顺序 |
| `src/platform/` | 本机存档层（IndexedDB `changju` 与 `changju.meta.v1`）、存档码 CJ1/CJ0、云同步客户端、恢复码、搬家导入 |
| `src/shared/` | 平台、游戏 SDK、Worker 共用的类型、消息协议与上限 |
| `src/sdk/` | 改写游戏用的 SDK：`core/` 是不依赖 React 的客户端，`react/` 是 hooks 与游戏外壳 `GameShell` |
| `src/games/<id>/` | 改写后的游戏，每款一个目录，入口 `index.html`，构建到 `/play/<id>/` |
| `src/styles/`、`src/ui/` | 平台与看板共用的设计系统和组件，数值只取 `brand/tokens.css` |
| `src/sw/` | Service Worker，构建成站点根下的 `/sw.js` |
| `kanban/`、`src/kanban/` | 看板与看板登录页的入口和代码 |
| `src/worker/` | Worker（Hono + Drizzle）：上报、合并、启动遥测、云存档、看板登录与数据，每天一次的到期清理 |
| `migrations/` | D1 表结构，部署时 CI 自动执行；Drizzle 表定义在 `src/worker/db/schema.ts` |
| `public/` | 原样拷进 `dist/` 的静态文件：旧单文件游戏 `games/*.html`、封面 `covers/`、`brand/` 副本、搬家页 `move.html`、`manifest.webmanifest`、响应头 `_headers` |
| `brand/` | 视觉系统：颜色、字体、间距等参数，标志与图标，规范见 `brand/DESIGN.md`；是品牌的唯一来源 |
| `public/brand/` | `brand/` 里静态页面用到的文件的发布副本，必须与 `brand/` 逐字节一致 |
| `scripts/check.mjs` | 检查脚本，见「检查与测试」 |
| `e2e/` | Playwright 端到端用例，与 `docs/TEST.md` 的用例同源 |
| `docs/DESIGN.md`、`docs/TEST.md` | 设计文档与测试文档 |
| `docs/DEPLOY.md`、`docs/LAUNCH.md` | 部署、回滚、排障手册与上线清单 |
| `wrangler.jsonc` | Cloudflare Worker 配置，静态资源目录是 `dist/` |

## 本地预览

```bash
npm ci
printf 'KANBAN_PASSWORD=local-test-pass\nKANBAN_SECRET=local-secret-for-tests\n' > .dev.vars   # 已在 .gitignore
npm run build
npx wrangler d1 migrations apply shoota-metrics --local
npx wrangler dev --port 8812
```

打开 http://localhost:8812 。数据只进项目根 `.wrangler/state` 里的本地 D1，看板 http://localhost:8812/kanban 的密码是上面写进 `.dev.vars` 的那个。改了平台代码要重新 `npm run build`，wrangler 会直接用新的 `dist/`。

只改界面时可以用 `npm run dev` 起 Vite 开发服务器，热更新更快；这时没有 Worker，上报、云存档和看板都不可用，旧游戏走固定地址 `/games/<id>`。

## 检查与测试

| 命令 | 内容 |
| --- | --- |
| `npm run typecheck` | `tsc -b`，四个子工程：浏览器（平台、看板、SDK、游戏）、Service Worker、Worker、Node 脚本与 e2e |
| `npm test` | Vitest：浏览器侧代码在 Node 里跑，`src/worker/` 在 workerd 里跑，D1 每个测试文件一份 |
| `npm run build` | Vite 构建到 `dist/` |
| `npm run check` | 内嵌脚本语法；目录里每款游戏的文件、封面、登记大小；旧游戏的 Google Fonts 是否异步加载；改写游戏有没有直接用 `localStorage`、`sessionStorage`、`indexedDB`；`public/brand/` 与 `brand/` 是否一致 |
| `npx playwright test` | 端到端用例，跑法与环境见 `docs/TEST.md` 第 3 节；浏览器用本机 Edge |

CI 每次 push 与 PR 依次跑前四条，任一失败就不部署。

## 统计与看板

平台按浏览器匿名统计访问、开局、游玩时长与启动结果，不需要账号。看板在 https://shoota.ai/kanban ，凭密码登录，密码向管理员要。登录过看板的浏览器之后的游玩不计入统计，自己测试时注意这一点。指标怎么算见 `docs/DESIGN.md` 的术语表与看板说明。

## 两种运行层

| | 旧单文件游戏 | 改写后的游戏 |
| --- | --- | --- |
| 目录里的 `runtime` | `legacy` | `play` |
| 文件 | `public/games/<id>.html`，一个文件包含全部代码 | `src/games/<id>/`，React + TS 源码 |
| 怎么加载 | 平台下载整个文件，注入 BOOT 脚本后写进不带 `allow-same-origin` 的沙箱 iframe | 同源 iframe 打开 `/play/<id>/` |
| 存档 | 游戏照常用 `localStorage`，BOOT 接管它，经 `window.Platform` 1.0 的消息交给平台 | 只经 SDK 读写，不直接碰 `localStorage`、`indexedDB`，检查脚本会拦 |
| 缓存 | 构建另出一份带内容摘要的 `/g/<id>-<摘要前 8 位>`，缓存一年；固定地址 `/games/<id>` 兜底 | 资源在 `/assets/`，文件名带摘要，缓存一年；页面由 Service Worker 缓存 |
| 横竖屏与信息区 | 游戏自己排版，平台只去掉了常驻工具栏 | 用 `GameShell` 的可折叠信息区与方向感知布局 |

两种游戏的存档都是字符串键值表，存在同一个 IndexedDB 位置，键名不变；从旧版换成改写版不丢进度，前提是键名与值的格式保持不变。

## 加游戏、改游戏

**旧单文件游戏**（老板发来的单文件版本也走这条）：

- 把文件放进 `public/games/<id>.html`，再在 `src/catalog/catalog.ts` 照现有条目加一项：`src` 写 `'games/<id>.html'`，`size` 写文件字节数，`runtime: 'legacy'`，`orientation` 写游戏偏好的方向（`portrait`、`landscape` 或 `any`）。
- 改游戏直接替换文件，同时更新目录里的 `size`；构建会按新内容生成新的摘要地址，玩家下次打开就拿到新版。
- 封面放 `public/covers/<id>.jpg`，目录条目写 `cover: 'covers/<id>.jpg'`；标题由页面叠加，图片建议 46:21 横版并在左侧预留文字空间。
- 存档：游戏里照常用 `localStorage`，平台会接管它，每款游戏的存档单独保存在玩家的浏览器里并同步到云端。沙箱里没有 IndexedDB，用到它的游戏要退回 `localStorage`。
- 外部字体：引用 Google Fonts 写成 `<link rel="stylesheet" href="…" media="print" onload="this.media='all'">`，不用 `@import` 或普通 `<link>`。连不上 fonts.googleapis.com 时，阻塞写法会让游戏一直白屏到请求超时；`npm run check` 会拦下这两种写法。
- 外部链接写 `target="_blank"`，平台会在浏览器新标签页打开。
- 平台接口：平台在游戏页面加载前注入 `window.Platform`，单独打开游戏文件时它不存在，所以先判断一下：

```js
if (window.Platform) {
  Platform.defineAchievements([             // 声明成就，显示在详情页和游戏库
    { key: 'titled', name: '封号斗罗' }
  ]);
  Platform.unlock('titled');                 // 解锁成就，平台弹出提示
  Platform.setStatus('2645 年 · 魂力 41 级'); // 显示在游戏面板和「继续游玩」
  Platform.exit();                           // 回到详情页
}
```

**改写后的游戏**：

- 新建 `src/games/<id>/`，入口 `index.html` 引 `main.tsx`；构建自动发现这个目录，产出 `dist/play/<id>/index.html`，不用改 `vite.config.ts`。
- `main.tsx` 里 `connectShoota({ game: '<id>' })`，再渲染 `<ShootaProvider client={client}><App /></ShootaProvider>`；存档、成就、状态文字、退出都经 `src/sdk/react` 的 hooks，写法照 `src/games/yike/`。
- 顶部信息区与横竖屏排版用 `GameShell`：核心内容区标 `data-shell="core"`，横屏矮屏时信息区自动折叠。
- 从旧单文件改写时，存档键名和值的格式不变，玩法与数值不变，美术沿用游戏自己的；字体自托管放进游戏目录，不引外部字体。
- 在目录条目里把 `runtime` 改成 `'play'`，旧文件 `public/games/<id>.html` 保留，作为还没刷新的平台页面的兜底。
- 测试照 `docs/TEST.md`「改写游戏」一节：握手与存档、横屏折叠、旧存档接着玩。

## 改平台样式

平台与看板的颜色、字号、间距、圆角、动效只引用 `brand/tokens.css` 经 `src/styles/semantic.css` 映射出的变量，不写色值；亮暗跟随系统，两套都用 shoota 配色。悬停、聚焦、按下统一用 `brand/state-layer.css` 的 `state-layer` 与 `focus-ring`。组件在 `src/ui/`，先找现成的再写新的。

要改品牌参数，先改 `brand/tokens.json` 再重新生成，命令见 `brand/DESIGN.md`；改完把静态页面用到的文件复制到 `public/brand/` 的同一路径，`npm run check` 会核对两边一致。看 `brand/index.html` 时要起本地服务（如 `python3 -m http.server 8000 -d brand`），直接双击打开时图标显示不出来。

## 发布

push 到 `main` 就会自动上线：先过质量门，再执行数据库迁移、部署，然后做健康检查；健康检查不通过会自动回滚到上一版。进度在仓库的 Actions 页看。PR 只跑质量门，不会部署。

想先在线上试、不影响正式站：推到 `test` 分支（`git push origin HEAD:test`），同样的流程会部署到 https://test.shoota.ai 。重写版在 `rewrite` 分支，推上去部署到 https://next.shoota.ai 。这两个站的统计和看板各用单独的数据库，搜索引擎不收录。试好了再合进 `main`。

提交前先在本地跑一遍「检查与测试」的前四条。部署细节、回滚与排障见 `docs/DEPLOY.md`。
