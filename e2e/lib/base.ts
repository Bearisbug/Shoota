// 被测服务：集成阶段的本地 wrangler dev（docs/TEST.md §3）。playwright.config.ts、中转与新开的浏览器上下文都从这里取地址。
// E2E_PORT 换端口：旧版 dd731d6 起在 8811 上时，E2E_PORT=8811 跑的就是旧版（TEST.md §3「本地跑旧版」）
export const PORT = Number(process.env.E2E_PORT || 8812);
export const BASE = `http://localhost:${PORT}`;
