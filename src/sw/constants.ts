// Service Worker 与平台页面共用的约定（平台页面经 src/app/player/launch.ts 引用）。

// Service Worker 从缓存给出游戏文件时加这个响应头，启动遥测据此填「来自缓存」c
export const CACHE_HIT_HEADER = 'x-shoota-cache';

export const SW_URL = '/sw.js';
