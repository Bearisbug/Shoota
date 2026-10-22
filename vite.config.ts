import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 四类入口：平台（根目录 index.html）、看板与登录页（kanban/）、改写后的游戏（src/games/<id>/index.html，自动发现）。
// 游戏产出到 dist/play/<id>/index.html，加游戏不用改这个文件。public/ 原样拷贝到 dist/。
// 另外两样产物：站点根下的 Service Worker dist/sw.js，旧单文件游戏按内容摘要复制的 dist/g/<id>-<摘要前 8 位>.html。
const root = import.meta.dirname;
const gamesDir = resolve(root, 'src/games');
const gameEntry = (id: string) => resolve(gamesDir, id, 'index.html');
const games = existsSync(gamesDir)
  ? readdirSync(gamesDir, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(gameEntry(d.name))).map(d => d.name)
  : [];

// 旧游戏文件的摘要地址（§15 缓存）：内容变了才换地址，所以能缓存一年。
// 地址不带 .html（静态资源按默认 html 路径规则直接返回 .html 文件，不经 307），落盘带 .html，才按 text/html 返回并压缩。
const legacyDir = resolve(root, 'public/games');
const legacyFiles = readdirSync(legacyDir).filter(f => f.endsWith('.html')).map(f => {
  const id = f.slice(0, -5), source = readFileSync(resolve(legacyDir, f));
  return { id, source, url: `/g/${id}-${createHash('sha256').update(source).digest('hex').slice(0, 8)}` };
});

// 构建：Vite 按源路径给 HTML 命名（src/games/<id>/index.html），这里挪到 play/<id>/index.html。
// HTML 里的资源地址是 /assets/… 绝对路径，挪位置不影响引用。
function playOutput(): Plugin {
  return {
    name: 'shoota:play-output',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [key, file] of Object.entries(bundle)) {
        const m = /^src\/games\/([^/]+)\/index\.html$/.exec(file.fileName);
        if (!m || file.type !== 'asset') continue;
        delete bundle[key];
        this.emitFile({ type: 'asset', fileName: `play/${m[1]}/index.html`, source: file.source });
      }
    },
  };
}

// 构建：旧游戏文件按摘要再出一份到 g/
function legacyGames(): Plugin {
  return {
    name: 'shoota:legacy-games',
    apply: 'build',
    generateBundle() {
      for (const g of legacyFiles) this.emitFile({ type: 'asset', fileName: `${g.url.slice(1)}.html`, source: g.source });
    },
  };
}

// 构建：Service Worker 单独打成站点根下的普通脚本（不是模块），作用域才是整个站点
function serviceWorker(): Plugin {
  return {
    name: 'shoota:sw',
    apply: 'build',
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: 'warn',
        publicDir: false,
        build: {
          outDir: resolve(root, 'dist'),
          emptyOutDir: false,
          minify: true,
          lib: { entry: resolve(root, 'src/sw/sw.ts'), formats: ['iife'], name: 'shootaSw', fileName: () => 'sw.js' },
        },
      });
    },
  };
}

// 开发：/play/<id>/ 指到源目录，和线上地址一致；按请求查目录，开着 dev server 新建游戏也能打开。
function playDev(): Plugin {
  return {
    name: 'shoota:play-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const m = /^\/play\/([\w-]+)\/(?:index\.html)?(\?.*)?$/.exec(req.url ?? '');
        if (m && existsSync(gameEntry(m[1]))) req.url = `/src/games/${m[1]}/index.html${m[2] ?? ''}`;
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  appType: 'mpa',
  plugins: [react(), playOutput(), legacyGames(), serviceWorker(), playDev()],
  // 游戏 → 摘要地址；开发服务器不注入，运行层退回固定地址 /games/<id>
  define: command === 'build' ? { __SHOOTA_GAME_FILES__: JSON.stringify(Object.fromEntries(legacyFiles.map(g => [g.id, g.url]))) } : {},
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: resolve(root, 'index.html'),
        kanban: resolve(root, 'kanban/index.html'),
        kanbanLogin: resolve(root, 'kanban/login.html'),
        ...Object.fromEntries(games.map(id => [`play-${id}`, gameEntry(id)])),
      },
    },
  },
}));
