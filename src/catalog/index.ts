import { CATALOG } from './catalog';

export { CATALOG };
export type { GameEntry } from './types';

export const gameById = (id: string) => CATALOG.find(g => g.id === id);

// 看板按它显示游戏中文名
export const GAME_TITLES: Record<string, string> = Object.fromEntries(CATALOG.map(g => [g.id, g.title]));
