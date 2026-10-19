# shoota

文字游戏平台：商店、游戏库、免账号存档。线上地址 https://shoota.ai

## 目录

| 路径 | 内容 |
| --- | --- |
| `public/index.html` | 平台：商店、游戏库、存档页。商店里的游戏列表是文件里的 `CATALOG`，顺序就是商店里的顺序 |
| `public/games/<id>.html` | 每款游戏一个单文件 HTML |
| `scripts/check.mjs` | 质量门：检查内嵌脚本语法，以及 `CATALOG` 登记的游戏文件都存在 |
| `src/worker.js`、`src/kanban.html` | 匿名统计上报接口与 `/kanban` 看板，看板页面打包进 Worker，不放在 `public/` |
| `migrations/` | 统计数据库 D1 的表结构，部署时 CI 自动执行 |
| `docs/DESIGN.md`、`docs/TEST.md` | 统计与看板的设计文档和测试文档，指标口径以设计文档为准 |
| `wrangler.jsonc` | Cloudflare Worker 配置 |
| `docs/DEPLOY.md` | 部署、回滚、排障手册 |

## 本地预览

平台用 `fetch` 加载游戏文件，直接双击 `index.html` 能看到商店，但点开游戏会失败。要先起一个本地服务：

```bash
python3 -m http.server 8000 -d public
```

然后打开 http://localhost:8000 。这种方式只有静态页面，没有统计上报和看板，上报请求失败不影响游玩。

要连统计和看板一起跑，用 wrangler，步骤见 `docs/TEST.md` 第 3 节：本地密码写进 `.dev.vars`（已在 `.gitignore`），执行本地迁移，再 `npx -y wrangler@4.151.1 dev --port 8791`，数据只进本地数据库。

## 统计与看板

平台按浏览器匿名统计访问、开局和游玩时长，不需要账号。看板在 https://shoota.ai/kanban ，凭密码登录，密码向管理员要。登录过看板的浏览器之后的游玩不计入统计，自己测试时注意这一点。指标怎么算见 `docs/DESIGN.md` 的术语表与看板说明。

## 改游戏、加游戏

- **改游戏**：直接改 `public/games/<id>.html`。
- **加游戏**：把文件放进 `public/games/`，再在 `public/index.html` 的 `CATALOG` 里照现有条目加一项，`src` 写 `'games/<id>.html'`。封面按 id 用 canvas 画，新 id 会用通用封面。
- **存档**：游戏里照常用 `localStorage`，平台会接管它，每款游戏的存档单独保存在玩家的浏览器里。沙箱里没有 IndexedDB，用到它的游戏要退回 `localStorage`。
- **改存档格式要兼容旧存档**：玩家的进度只存在他们自己的浏览器里，平台没法替他们迁移。

### 可选：平台 SDK

平台会在游戏页面加载前注入 `window.Platform`。单独打开游戏文件时它不存在，所以先判断一下：

```js
if (window.Platform) {
  Platform.defineAchievements([             // 声明成就，显示在商店页和游戏库
    { key: 'titled', name: '封号斗罗' }
  ]);
  Platform.unlock('titled');                 // 解锁成就，平台弹出提示
  Platform.setStatus('2645 年 · 魂力 41 级'); // 显示在游戏顶栏和「继续游玩」
  Platform.exit();                           // 回到商店页
}
```

## 发布

push 到 `main` 就会自动上线，约 1 分钟：先过质量门，再部署，然后做健康检查；健康检查不通过会自动回滚到上一版。进度在仓库的 Actions 页看。PR 只跑质量门，不会部署。

提交前先在本地跑一次 `node scripts/check.mjs`。
