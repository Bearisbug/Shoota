// 单测用的平台能力：存档与统计都放内存里，调用记下来
import { vi } from 'vitest';
import type { GameSave, GameStat } from '../../../shared/save';
import type { PlayerPorts, SaveRead } from '../ports';

export function fakePorts(read: (gid: string) => Promise<SaveRead> = async () => ({ ok: true, save: undefined })) {
  const stats: Record<string, GameStat> = {};
  const saves: Record<string, GameSave> = {};
  const ports = {
    readSave: vi.fn(read),
    writeSave: vi.fn(async (gid: string, save: GameSave) => {
      saves[gid] = save;
      return true;
    }),
    hold: vi.fn(),
    release: vi.fn(),
    user: () => ({ id: 'u1', nickname: '玩家' }),
    stat: (gid: string) => (stats[gid] ??= { seconds: 0, last: 0, ach: {}, status: '' }),
    persist: vi.fn(),
    setAchDefs: vi.fn(),
    achName: vi.fn((_gid: string, key: string) => (key === 'first' ? '第一次' : undefined)),
    track: vi.fn(),
    requestSync: vi.fn(),
  } satisfies PlayerPorts;
  return { ports, stats, saves };
}
