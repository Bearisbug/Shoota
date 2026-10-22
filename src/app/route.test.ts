import { describe, expect, it } from 'vitest';
import { navOf, parseHash } from './route';

describe('hash 路由（§13 路由与兼容）', () => {
  it('认得五种页面，其余一律是商店', () => {
    expect(parseHash('')).toEqual({ page: 'store' });
    expect(parseHash('#store')).toEqual({ page: 'store' });
    expect(parseHash('#game-f1')).toEqual({ page: 'game', id: 'f1' });
    expect(parseHash('#library')).toEqual({ page: 'library' });
    expect(parseHash('#backup')).toEqual({ page: 'backup' });
    expect(parseHash('#play-yike')).toEqual({ page: 'play', id: 'yike' });
    expect(parseHash('#whatever')).toEqual({ page: 'store' });
    expect(parseHash('#login')).toEqual({ page: 'store' });
  });

  it('#recover= 打开存档页的恢复确认，恢复码按 URL 解码', () => {
    expect(parseHash('#recover=01AB-CDEF')).toEqual({ page: 'backup', recover: '01AB-CDEF' });
    expect(parseHash('#recover=01AB%20CDEF')).toEqual({ page: 'backup', recover: '01AB CDEF' });
    expect(parseHash('#recover=%E0%A4%A')).toEqual({ page: 'backup', recover: '%E0%A4%A' });
  });

  it('导航高亮：详情归商店，恢复确认归存档，游戏页不高亮', () => {
    expect(navOf({ page: 'game', id: 'f1' })).toBe('store');
    expect(navOf({ page: 'backup', recover: 'x' })).toBe('backup');
    expect(navOf({ page: 'play', id: 'f1' })).toBeUndefined();
    expect(navOf({ page: 'store' })).toBe('store');
  });
});
