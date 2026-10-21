// 质量门：每个页面的内嵌 <script> 与 Worker 脚本能解析，商店目录里登记的游戏文件都存在，
// public/brand/ 下的文件与 brand/ 里的同名源文件逐字节一致（brand/ 是唯一来源，public/brand/ 只是给静态站发布的副本），
// 游戏引用的 Google Fonts 样式表异步加载（国内连不上时，阻塞写法会让游戏长时间空白）。
// 用法：node scripts/check.mjs（CI 每次 push / PR 都跑，失败就不部署）
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';

const pages = ['public/index.html', 'public/move.html', 'src/kanban.html', ...readdirSync('public/games').filter(f => f.endsWith('.html')).map(f => 'public/games/' + f)];
const tmp = mkdtempSync(join(tmpdir(), 'changju-check-'));
let bad = 0, n = 0;
try {
  for (const page of pages) {
    let i = 0;
    for (const [, attrs, body] of readFileSync(page, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(attrs)) continue;
      n++; i++;
      const where = `${page} 第 ${i} 段 <script${attrs}>`;
      if (/application\/(ld\+)?json/.test(attrs)) {
        try { JSON.parse(body); } catch (e) { bad++; console.error(`✗ ${where} 不是合法 JSON：${e.message}`); }
        continue;
      }
      const file = join(tmp, /type=["']module/.test(attrs) ? 'x.mjs' : 'x.js');
      writeFileSync(file, body);
      try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
      catch (e) { bad++; console.error(`✗ ${where} 语法错误：\n${String(e.stderr).replace(/\S*x\.m?js/, page)}`); }
    }
  }
  const worker = join(tmp, 'worker.mjs');
  writeFileSync(worker, readFileSync('src/worker.js', 'utf8'));
  try { execFileSync(process.execPath, ['--check', worker], { stdio: 'pipe' }); }
  catch (e) { bad++; console.error(`✗ src/worker.js 语法错误：\n${String(e.stderr).replace(/\S*worker\.mjs/, 'src/worker.js')}`); }
  for (const [, src] of readFileSync('public/index.html', 'utf8').matchAll(/src:'(games\/[^']+)'/g)) {
    if (!existsSync('public/' + src)) { bad++; console.error(`✗ 商店目录登记了 ${src}，但 public/${src} 不存在`); }
  }
  const catalogSource = readFileSync('public/index.html', 'utf8').match(/const CATALOG = (\[[\s\S]*?\n\]);/);
  if (!catalogSource) { bad++; console.error('✗ 无法读取商店目录'); }
  else {
    const catalog = runInNewContext(catalogSource[1], Object.create(null), { timeout: 1000 });
    const ids = new Set();
    for (const game of catalog) {
      if (ids.has(game.id)) { bad++; console.error(`✗ 重复的游戏标识：${game.id}`); }
      ids.add(game.id);
      if (game.cover && (!/^covers\/[\w-]+\.jpg$/.test(game.cover) || !existsSync('public/' + game.cover))) {
        bad++; console.error(`✗ ${game.id} 的封面缺失或路径不合法`);
      }
      if (existsSync('public/' + game.src) && statSync('public/' + game.src).size !== game.size) {
        bad++; console.error(`✗ ${game.id} 的登记大小与游戏文件不一致`);
      }
    }
  }
  for (const page of pages.filter(p => p.startsWith('public/games/'))) {
    const html = readFileSync(page, 'utf8');
    if (/@import\s+url\(\s*['"]?https:\/\/fonts\.googleapis\.com/.test(html)) { bad++; console.error(`✗ ${page} 用 @import 引 Google Fonts，会阻塞显示：改成 <link rel="stylesheet" href="…" media="print" onload="this.media='all'">`); }
    for (const [link] of html.matchAll(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css[^>]*>/g)) {
      if (!/media="print"/.test(link) || !/onload=/.test(link)) { bad++; console.error(`✗ ${page} 的 Google Fonts 样式表会阻塞显示：给 <link> 加 media="print" onload="this.media='all'"`); }
    }
  }
  const index = readFileSync('public/index.html', 'utf8');
  for (const [, ref] of index.matchAll(/(?:src|href)="(brand\/[^"]+)"|url\((brand\/[^)]+)\)/g).map(m => [m[0], m[1] || m[2]])) {
    if (!existsSync('public/' + ref)) { bad++; console.error(`✗ public/index.html 引用了 ${ref}，但 public/${ref} 不存在`); }
  }
  for (const page of ['src/kanban.html', 'src/worker.js']) {
    for (const [, ref] of readFileSync(page, 'utf8').matchAll(/(?:src|href)="\/(brand\/[^"]+)"/g)) {
      if (!existsSync('public/' + ref)) { bad++; console.error(`✗ ${page} 引用了 /${ref}，但 public/${ref} 不存在`); }
    }
  }
  for (const file of readdirSync('public/brand', { recursive: true, withFileTypes: true }).filter(d => d.isFile()).map(d => join(d.parentPath, d.name))) {
    const src = file.replace(/^public\//, '');
    if (!existsSync(src)) { bad++; console.error(`✗ ${file} 在 brand/ 里没有对应的源文件`); }
    else if (!readFileSync(src).equals(readFileSync(file))) { bad++; console.error(`✗ ${file} 与 ${src} 不一致：改 brand/ 后重新复制，cp ${src} ${file}`); }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
if (bad) { console.error(`\n${bad} 处问题，未部署。`); process.exit(1); }
console.log(`✓ ${pages.length} 个页面、${n} 段内嵌脚本与 Worker 脚本解析通过，游戏标识唯一，游戏与封面文件齐全，登记大小与文件一致，外部字体不阻塞，public/brand/ 与 brand/ 一致`);
