// 关卡生成与旧版逐关一致：拿 public/games/yike.html 里的原始生成代码当裁判。
import { describe, expect, it } from 'vitest';
import { coverOf, genLevel } from './gen';
import { legacyGen } from './testing/legacy';

const old = legacyGen();

describe('关卡生成', () => {
  it('第 1～40 关的方子、药包与暂存台容量逐项相同', () => {
    for (let lv = 1; lv <= 40; lv++) expect(genLevel(lv), `第 ${lv} 关`).toStrictEqual(old.genLevel(lv));
  });

  it('开局遮挡逐包相同', () => {
    for (let lv = 1; lv <= 20; lv++) {
      const mine = genLevel(lv).tiles.map(t => ({ ...t, loc: 'board', cov: false }));
      const theirs = mine.map(t => ({ ...t }));
      coverOf(mine);
      old.coverOf(theirs);
      expect(mine.map(t => t.cov), `第 ${lv} 关`).toEqual(theirs.map(t => t.cov));
    }
  });

  it('第 1 关是热身：3 张方子、没有抽屉和盲包，暂存台 6 格', () => {
    const L = genLevel(1);
    expect(L.targets).toHaveLength(3);
    expect(L.dr).toEqual([0, 0]);
    expect(L.cap).toBe(6);
    expect(L.tiles.some(t => t.blind || t.src === 'd' || t.decoy)).toBe(false);
  });
});
