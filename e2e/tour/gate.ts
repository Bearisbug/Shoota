// 走查的确定性门与发布（test-doc flow-walkthrough.md 第 6、7 步）：
// 两遍的 webp 先在同样的位置遮掉两遍各自登记的动态区域，再用 ImageMagick 在 -fuzz 0.5% 下数差异像素，
// 不超过全图像素的 0.01% 算通过（网页图的门槛）。加 --publish 时把通过的键从最后一遍复制到 docs/tour/shots/，
// 并在 docs/tour/shots.json 里替换这些键的条目；commits 按 docs/tour/tour.json 的 repos（别名 → 相对项目根的路径）逐仓取，seed 也取自那里。
// 没通过的键不发布。
// 用法：TOUR_RUN=RUN-039 node e2e/tour/gate.ts [--publish]（只用 Node 自带模块，直接用 node 跑）
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface Rect { x: number; y: number; w: number; h: number }
interface Entry { key: string; dynamic_regions: Rect[]; [field: string]: unknown }

const ROOT = resolve(import.meta.dirname, '../..');
const run = process.env.TOUR_RUN;
if (!run) throw new Error('先设本轮编号，例如 TOUR_RUN=RUN-039');
const out = resolve(ROOT, '.tour-out', run), tour = resolve(ROOT, 'docs/tour');
const read = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const pass = (n: number) => read<Entry[]>(resolve(out, `pass-${n}`, 'shots.json'));
const [first, last] = [pass(1), pass(2)];

// 遮掉动态区域后转成 png，返回路径与宽高
function masked(n: number, key: string, regions: Rect[]) {
  const src = resolve(out, `pass-${n}`, key + '.webp'), dst = resolve(out, 'gate', `${n}`, key + '.png');
  mkdirSync(dirname(dst), { recursive: true });
  const draw = regions.flatMap(r => ['-draw', `rectangle ${r.x},${r.y} ${r.x + r.w},${r.y + r.h}`]);
  execFileSync('magick', [src, '-fill', 'black', ...draw, dst]);
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', dst], { encoding: 'utf8' }).split(' ').map(Number);
  return { dst, w, h };
}

const passed: string[] = [];
for (const e of last) {
  const prev = first.find(x => x.key === e.key);
  if (!prev) { console.log(`${e.key} 第 1 遍没拍到，未发布`); continue; }
  const regions = [...prev.dynamic_regions, ...e.dynamic_regions];
  const a = masked(1, e.key, regions), b = masked(2, e.key, regions);
  const r = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '0.5%', a.dst, b.dst, 'null:'], { encoding: 'utf8' });
  const diff = a.w === b.w && a.h === b.h ? Number.parseFloat(r.stderr) : Number.POSITIVE_INFINITY;
  const limit = Math.floor(a.w * a.h * 0.0001), ok = diff <= limit;
  console.log(`${e.key} 遮罩 ${regions.length} 块后差异 ${diff} 像素，上限 ${limit}：${ok ? '通过' : '没通过，未发布'}`);
  if (ok) passed.push(e.key);
}

if (process.argv.includes('--publish') && passed.length) {
  const cfg = read<{ repos: Record<string, string>; seed: string }>(resolve(tour, 'tour.json'));
  const commits = Object.fromEntries(Object.entries(cfg.repos).map(([alias, path]) =>
    [alias, execFileSync('git', ['-C', resolve(ROOT, path), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()]));
  const list = resolve(tour, 'shots.json');
  const kept = existsSync(list) ? read<{ shots: Entry[] }>(list).shots.filter(s => !passed.includes(s.key)) : [];
  const fresh = last.filter(e => passed.includes(e.key)).map(e => ({ ...e, commits, seed: cfg.seed }));
  for (const e of fresh) {
    const dst = resolve(tour, 'shots', e.key + '.webp');
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(resolve(out, 'pass-2', e.key + '.webp'), dst);
  }
  writeFileSync(list, JSON.stringify({ shots: [...kept, ...fresh].sort((x, y) => x.key.localeCompare(y.key)) }, null, 2) + '\n');
  console.log(`已发布 ${fresh.length} 张到 docs/tour/shots/`);
}
if (passed.length < last.length) process.exitCode = 1;
