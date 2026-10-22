// 游戏文件地址（§15 缓存）。旧单文件游戏优先取带内容摘要的 /g/<游戏>-<摘要前 8 位>，缓存一年；
// 它 404（发布时开着旧页面）就改取固定地址 /games/<游戏>。两种地址都不带 .html，免得静态资源先 307 一次。
// 摘要表由构建写进 __SHOOTA_GAME_FILES__（游戏 → 地址）；开发服务器和单测里没有这张表，直接用固定地址。

import type { GameEntry } from '../../catalog';

declare const __SHOOTA_GAME_FILES__: Record<string, string> | undefined;

const HASHED: Record<string, string> = typeof __SHOOTA_GAME_FILES__ === 'object' && __SHOOTA_GAME_FILES__ ? __SHOOTA_GAME_FILES__ : {};

export const fixedUrl = (entry: Pick<GameEntry, 'src'>) => '/' + entry.src.replace(/^\/+/, '').replace(/\.html$/, '');

// 依次尝试的地址：带摘要的在前，固定地址兜底
export function legacyUrls(entry: Pick<GameEntry, 'id' | 'src'>, table: Record<string, string> = HASHED): string[] {
  const fixed = fixedUrl(entry);
  const hashed = table[entry.id];
  return hashed && hashed !== fixed ? [hashed, fixed] : [fixed];
}

// 改写后的游戏页，带尾斜杠免一次 307
export const playUrl = (id: string) => `/play/${id}/`;
