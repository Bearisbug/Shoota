// D1「shoota-metrics」的表结构，和 migrations/ 下的迁移逐列一致（db/schema.test.ts 核对），口径见 docs/DESIGN.md §7、§9。
// 前四张是统计与登录防护（0001、0002），后五张是云存档与启动遥测（0003）。
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const visitors = sqliteTable('visitors', {
  vid: text('vid').primaryKey(),
  firstDay: text('first_day').notNull(),
  device: text('device').notNull(),
  wechat: integer('wechat').notNull(),
  country: text('country').notNull(),
  prior: integer('prior').notNull().default(0),
}, t => [index('visitors_first_day').on(t.firstDay)]);

export const visitorDays = sqliteTable('visitor_days', {
  vid: text('vid').notNull(),
  day: text('day').notNull(),
  visits: integer('visits').notNull().default(0),
  seconds: integer('seconds').notNull().default(0),
  backups: integer('backups').notNull().default(0),
  restores: integer('restores').notNull().default(0),
}, t => [primaryKey({ columns: [t.vid, t.day] }), index('visitor_days_day').on(t.day)]);

export const gameDays = sqliteTable('game_days', {
  vid: text('vid').notNull(),
  game: text('game').notNull(),
  day: text('day').notNull(),
  starts: integer('starts').notNull().default(0),
  seconds: integer('seconds').notNull().default(0),
}, t => [primaryKey({ columns: [t.vid, t.game, t.day] }), index('game_days_day').on(t.day)]);

export const loginGuards = sqliteTable('login_guards', {
  ipHash: text('ip_hash').primaryKey(),
  fails: integer('fails').notNull(),
  lockedUntil: integer('locked_until'),
});

// 云存档：三张表都以云存档编号的 SHA-256 为键，服务端不存编号与恢复码的原文（INV-CLOUD-001）
export const cloudAccounts = sqliteTable('cloud_accounts', {
  sid: text('sid').primaryKey(),
  codeHash: text('code_hash').notNull(),
  sidBox: text('sid_box').notNull(),
  createdAt: integer('created_at').notNull(),
  seenDay: text('seen_day').notNull(),
  recoverN: integer('recover_n').notNull().default(0),
}, t => [uniqueIndex('cloud_accounts_code_hash').on(t.codeHash), index('cloud_accounts_seen_day').on(t.seenDay)]);

export const cloudGames = sqliteTable('cloud_games', {
  sid: text('sid').notNull(),
  game: text('game').notNull(),
  rev: integer('rev').notNull(),
  enc: text('enc').notNull(),
  body: text('body').notNull(),
  bytes: integer('bytes').notNull(),
  seconds: integer('seconds').notNull(),
  lastPlayed: integer('last_played').notNull(),
  status: text('status').notNull().default(''),
  savedAt: integer('saved_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  beatRev: integer('beat_rev'),
}, t => [primaryKey({ columns: [t.sid, t.game] })]);

export const cloudMeta = sqliteTable('cloud_meta', {
  sid: text('sid').primaryKey(),
  rev: integer('rev').notNull(),
  data: text('data').notNull(),
  savedAt: integer('saved_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// 启动遥测：按北京日期、游戏、国家或地区、打开环境汇总，不存逐次记录
export const launchDays = sqliteTable('launch_days', {
  day: text('day').notNull(),
  game: text('game').notNull(),
  country: text('country').notNull(),
  env: text('env').notNull(),
  starts: integer('starts').notNull().default(0),
  ready: integer('ready').notNull().default(0),
  fail: integer('fail').notNull().default(0),
  cancel: integer('cancel').notNull().default(0),
  b1: integer('b1').notNull().default(0),
  b3: integer('b3').notNull().default(0),
  b10: integer('b10').notNull().default(0),
  b30: integer('b30').notNull().default(0),
  bx: integer('bx').notNull().default(0),
  fsTry: integer('fs_try').notNull().default(0),
  fsOk: integer('fs_ok').notNull().default(0),
}, t => [primaryKey({ columns: [t.day, t.game, t.country, t.env] }), index('launch_days_day').on(t.day)]);

export const launchFails = sqliteTable('launch_fails', {
  day: text('day').notNull(),
  country: text('country').notNull(),
  reason: text('reason').notNull(),
  n: integer('n').notNull().default(0),
}, t => [primaryKey({ columns: [t.day, t.country, t.reason] }), index('launch_fails_day').on(t.day)]);
