// 六组视口核心区占比复测（TC-PLAY-017）：6 组视口 × 13 款，每款一个新浏览器，量法见 e2e/lib/core-area.ts。
// 读数写到 test-results/core-area.json，与 §13 的旧版数并排；登记时拷进本轮证据目录。
import { mkdirSync, writeFileSync } from 'node:fs';
import { GAMES, MEASURE_VPS, OLD, TARGETS, counted, measureGame, summarize, type Reading } from './lib/core-area';
import { expect, onlyOn, test } from './lib/fixtures';
import { dismissRotateHint, title, play } from './lib/ui';
import { VIEWPORTS } from './lib/viewports';

onlyOn('desktop');

const OUT = 'test-results/core-area.json';

test('TC-PLAY-017 六组视口核心区占比复测', async ({ fresh }) => {
  test.setTimeout(45 * 60_000);
  const readings: Reading[] = [];
  const failed: { vp: string; id: string; error: string }[] = [];
  const save = () => {
    mkdirSync('test-results', { recursive: true });
    writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), summary: summarize(readings), old: OLD, targets: TARGETS, readings, failed }, null, 2));
  };

  for (const [i, vp] of MEASURE_VPS.entries()) {
    const v = VIEWPORTS[vp], n = GAMES.filter(id => counted(vp, id)).length;
    await test.step(`${i + 1} ${v.width}×${v.height} 量 ${n} 款`, async () => {
      for (const id of GAMES) {
        const page = await fresh({ at: vp, reducedMotion: 'reduce' });
        await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort('connectionfailed'));
        try {
          const fr = await play(page, id);
          await dismissRotateHint(page);
          readings.push(await measureGame(page, fr, vp, id));
        } catch (e) {
          failed.push({ vp, id, error: String(e).split('\n')[0] });
        }
        await page.context().close();
      }
      save();
      const s = summarize(readings)[vp], t = TARGETS[vp];
      expect.soft(s?.n, `${vp} 计入的款数`).toBe(n);
      expect.soft(s?.median ?? 0, `${vp} 中位数（旧版 ${OLD[vp].median}%）`).toBeGreaterThanOrEqual(t.median);
      if (t.min !== undefined) expect.soft(s?.min ?? 0, `${vp} 最低（旧版 ${OLD[vp].min}%）`).toBeGreaterThanOrEqual(t.min);
      if (t.screenMedian !== undefined) expect.soft(s?.screenMedian ?? 0, `${vp} 整屏中位数（旧版 ${OLD[vp].screenMedian}%）`).toBeGreaterThanOrEqual(t.screenMedian);
    });
  }

  await test.step('7 六组视口每款都有读数，没有一款记成「进主界面的步骤没点到」', () => {
    expect(failed, '没量到的').toEqual([]);
    for (const vp of MEASURE_VPS) expect(readings.filter(r => r.vp === vp).map(r => r.id), vp).toEqual(GAMES);
    const missed = readings.filter(r => r.misses.length).map(r => `${r.vp} ${title(r.id)}：${r.misses.join('；')}`);
    expect(missed).toEqual([]);
  });
});
