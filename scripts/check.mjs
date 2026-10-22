// 质量门：每个页面的内嵌 <script> 能解析，商店目录里登记的游戏文件都存在，
// public/brand/ 下的文件与 brand/ 里的同名源文件逐字节一致（brand/ 是唯一来源，public/brand/ 只是给静态站发布的副本），
// 旧单文件游戏引用的 Google Fonts 样式表异步加载（国内连不上时，阻塞写法会让游戏长时间空白），
// 改写后的游戏不直接碰 localStorage、sessionStorage、indexedDB（存档只经 SDK，ADR-006）。
// 类型、单测与构建由 npm run typecheck、npm test、npm run build 管，这里不重复。
// 用法：npm run check（CI 每次 push / PR 都跑，失败就不部署）
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { CATALOG } = await import('../src/catalog/catalog.ts');

const legacyGames = readdirSync('public/games').filter(f => f.endsWith('.html')).map(f => 'public/games/' + f);
const playGames = existsSync('src/games')
  ? readdirSync('src/games', { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(`src/games/${d.name}/index.html`)).map(d => d.name)
  : [];
const shells = ['index.html', 'kanban/index.html', 'kanban/login.html'];
const pages = [...shells, 'public/move.html', ...legacyGames, ...playGames.map(id => `src/games/${id}/index.html`)];
const tmp = mkdtempSync(join(tmpdir(), 'changju-check-'));
let bad = 0, n = 0;
const fail = msg => { bad++; console.error('✗ ' + msg); };
try {
  for (const page of pages) {
    let i = 0;
    for (const [, attrs, body] of readFileSync(page, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(attrs)) continue;
      n++; i++;
      const where = `${page} 第 ${i} 段 <script${attrs}>`;
      if (/application\/(ld\+)?json/.test(attrs)) {
        try { JSON.parse(body); } catch (e) { fail(`${where} 不是合法 JSON：${e.message}`); }
        continue;
      }
      const file = join(tmp, /type=["']module/.test(attrs) ? 'x.mjs' : 'x.js');
      writeFileSync(file, body);
      try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
      catch (e) { fail(`${where} 语法错误：\n${String(e.stderr).replace(/\S*x\.m?js/, page)}`); }
    }
  }

  const ids = new Set();
  for (const game of CATALOG) {
    if (ids.has(game.id)) fail(`重复的游戏标识：${game.id}`);
    ids.add(game.id);
    if (!['portrait', 'landscape', 'any'].includes(game.orientation)) fail(`${game.id} 的 orientation 只能是 portrait、landscape 或 any`);
    if (game.runtime === 'play') {
      if (!playGames.includes(game.id)) fail(`${game.id} 登记为改写游戏，但 src/games/${game.id}/index.html 不存在`);
    } else if (game.runtime !== 'legacy') fail(`${game.id} 的 runtime 只能是 legacy 或 play`);
    // 旧单文件始终要在：改写游戏的旧文件留给还没更新的平台页面与 /games/<id> 旧地址
    if (!existsSync('public/' + game.src)) fail(`商店目录登记了 ${game.src}，但 public/${game.src} 不存在`);
    else if (statSync('public/' + game.src).size !== game.size) fail(`${game.id} 的登记大小与游戏文件不一致`);
    if (game.cover && (!/^covers\/[\w-]+\.jpg$/.test(game.cover) || !existsSync('public/' + game.cover))) fail(`${game.id} 的封面缺失或路径不合法`);
  }

  for (const page of legacyGames) {
    const html = readFileSync(page, 'utf8');
    if (/@import\s+url\(\s*['"]?https:\/\/fonts\.googleapis\.com/.test(html)) fail(`${page} 用 @import 引 Google Fonts，会阻塞显示：改成 <link rel="stylesheet" href="…" media="print" onload="this.media='all'">`);
    for (const [link] of html.matchAll(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css[^>]*>/g)) {
      if (!/media="print"/.test(link) || !/onload=/.test(link)) fail(`${page} 的 Google Fonts 样式表会阻塞显示：给 <link> 加 media="print" onload="this.media='all'"`);
    }
  }

  // 改写游戏：测试与 testing/ 下的辅助代码可以模拟旧版的 localStorage，其余源文件去掉注释后不能出现这三个名字
  for (const id of playGames) {
    for (const d of readdirSync(`src/games/${id}`, { recursive: true, withFileTypes: true }).filter(d => d.isFile())) {
      const file = join(d.parentPath, d.name);
      if (!/\.(ts|tsx|js|jsx|mjs|html)$/.test(file) || /\.test\.\w+$/.test(file) || /(^|\/)testing\//.test(file.slice(`src/games/${id}/`.length))) continue;
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const [api] of code.matchAll(/\b(?:localStorage|sessionStorage|indexedDB)\b/g)) fail(`${file} 直接用了 ${api}：改写游戏的存档只经 SDK 读写`);
    }
  }

  for (const page of shells) {
    for (const [, ref] of readFileSync(page, 'utf8').matchAll(/(?:src|href)="\/(brand\/[^"]+)"/g)) {
      if (!existsSync('public/' + ref)) fail(`${page} 引用了 /${ref}，但 public/${ref} 不存在`);
    }
  }
  for (const file of readdirSync('public/brand', { recursive: true, withFileTypes: true }).filter(d => d.isFile()).map(d => join(d.parentPath, d.name))) {
    const src = file.replace(/^public\//, '');
    if (!existsSync(src)) fail(`${file} 在 brand/ 里没有对应的源文件`);
    else if (!readFileSync(src).equals(readFileSync(file))) fail(`${file} 与 ${src} 不一致：改 brand/ 后重新复制，cp ${src} ${file}`);
  }
  if (existsSync('public/index.html')) fail('public/index.html 会在构建时覆盖平台入口：平台入口是根目录的 index.html');
} finally { rmSync(tmp, { recursive: true, force: true }); }
if (bad) { console.error(`\n${bad} 处问题，未部署。`); process.exit(1); }
console.log(`✓ ${pages.length} 个页面、${n} 段内嵌脚本解析通过；${CATALOG.length} 款游戏标识唯一，游戏与封面文件齐全，登记大小与文件一致，旧游戏外部字体不阻塞，${playGames.length} 款改写游戏不直接碰本地存储，public/brand/ 与 brand/ 一致`);
