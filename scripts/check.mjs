// 质量门：每个页面的内嵌 <script> 能解析，商店目录里登记的游戏文件都存在。
// 用法：node scripts/check.mjs（CI 每次 push / PR 都跑，失败就不部署）
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pages = ['public/index.html', ...readdirSync('public/games').filter(f => f.endsWith('.html')).map(f => 'public/games/' + f)];
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
  for (const [, src] of readFileSync('public/index.html', 'utf8').matchAll(/src:'(games\/[^']+)'/g)) {
    if (!existsSync('public/' + src)) { bad++; console.error(`✗ 商店目录登记了 ${src}，但 public/${src} 不存在`); }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
if (bad) { console.error(`\n${bad} 处问题，未部署。`); process.exit(1); }
console.log(`✓ ${pages.length} 个页面、${n} 段内嵌脚本解析通过，目录里的游戏文件齐全`);
