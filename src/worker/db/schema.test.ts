// 防漂移：Drizzle 表结构与 migrations/ 建出来的库逐表、逐列、逐索引一致；第 3 号迁移只新建五张表与 §25 的索引
import { applyD1Migrations, env } from 'cloudflare:test';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { beforeAll, expect, test } from 'vitest';
import * as schema from './schema';
import { rows } from '../test/setup';

const tables = Object.values(schema) as SQLiteTable[];

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

test('库里的表正好是 schema.ts 里的九张', async () => {
  const names = await rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB 'd1_*' AND name NOT GLOB '_cf_*' ORDER BY name");
  expect(names.map(r => r.name)).toEqual(tables.map(t => getTableConfig(t).name).sort());
});

test.each(tables.map(t => [getTableConfig(t).name, t] as const))('%s 的列、主键与索引和迁移一致', async (name, table) => {
  const cfg = getTableConfig(table);
  const cols = await rows<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>(`PRAGMA table_info(${name})`);
  const pkCols = cfg.primaryKeys[0]?.columns.map(c => c.name) ?? cfg.columns.filter(c => c.primary).map(c => c.name);
  expect(cols.map(c => ({ name: c.name, type: c.type, notNull: c.notnull === 1 || c.pk > 0, dflt: c.dflt_value })))
    .toEqual(cfg.columns.map(c => ({
      name: c.name, type: c.getSQLType().toUpperCase(), notNull: c.notNull,
      dflt: c.default === undefined ? null : typeof c.default === 'string' ? `'${c.default}'` : String(c.default),
    })));
  expect(cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name)).toEqual(pkCols);
  const indexes = await rows<{ name: string; unique: number; origin: string }>(`PRAGMA index_list(${name})`);
  expect(indexes.filter(i => i.origin === 'c').map(i => ({ name: i.name, unique: i.unique === 1 })).sort((a, b) => a.name.localeCompare(b.name)))
    .toEqual(cfg.indexes.map(i => ({ name: i.config.name, unique: i.config.unique })).sort((a, b) => a.name.localeCompare(b.name)));
});

test('第 3 号迁移只新建五张表和 §25 列的索引，不改旧表', () => {
  const m = env.TEST_MIGRATIONS.find(x => x.name.startsWith('0003_'))!;
  const stmts = m.queries.map(q => q.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim());
  expect(stmts.every(s => /^CREATE (TABLE|INDEX|UNIQUE INDEX) /.test(s))).toBe(true);
  expect(stmts.filter(s => s.startsWith('CREATE TABLE')).map(s => s.split(' ')[2]))
    .toEqual(['cloud_accounts', 'cloud_games', 'cloud_meta', 'launch_days', 'launch_fails']);
  expect(stmts.filter(s => !s.startsWith('CREATE TABLE')).map(s => s.replace(/^CREATE (UNIQUE )?INDEX \S+ ON /, '$1')))
    .toEqual(['UNIQUE cloud_accounts (code_hash)', 'cloud_accounts (seen_day)', 'launch_days (day)', 'launch_fails (day)']);
});
