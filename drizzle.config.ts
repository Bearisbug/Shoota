// Drizzle 表结构的出处是 src/worker/db/schema.ts，迁移仍手写在 migrations/，由 wrangler d1 migrations apply 执行。
// 加表或加列：先改 schema.ts，再用 `npx drizzle-kit export` 打出整库建表语句，把新增的那部分抄进下一个编号的迁移；
// 两边是否一致由 src/worker/db/schema.test.ts 核对。不要用 drizzle-kit generate 或 push：前者会按空库重新生成全部表，后者直接改库。
import { defineConfig } from 'drizzle-kit';

export default defineConfig({ dialect: 'sqlite', schema: './src/worker/db/schema.ts' });
