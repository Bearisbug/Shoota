-- 云存档与启动遥测，只新建表、不改旧表；字段口径见 docs/DESIGN.md §7、§9，索引见 §25
CREATE TABLE cloud_accounts (
  sid TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL,
  sid_box TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_day TEXT NOT NULL,
  recover_n INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX cloud_accounts_code_hash ON cloud_accounts (code_hash);
CREATE INDEX cloud_accounts_seen_day ON cloud_accounts (seen_day);

CREATE TABLE cloud_games (
  sid TEXT NOT NULL,
  game TEXT NOT NULL,
  rev INTEGER NOT NULL,
  enc TEXT NOT NULL,
  body TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  last_played INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  saved_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  beat_rev INTEGER,
  PRIMARY KEY (sid, game)
);

CREATE TABLE cloud_meta (
  sid TEXT PRIMARY KEY NOT NULL,
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE launch_days (
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  country TEXT NOT NULL,
  env TEXT NOT NULL,
  starts INTEGER NOT NULL DEFAULT 0,
  ready INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  cancel INTEGER NOT NULL DEFAULT 0,
  b1 INTEGER NOT NULL DEFAULT 0,
  b3 INTEGER NOT NULL DEFAULT 0,
  b10 INTEGER NOT NULL DEFAULT 0,
  b30 INTEGER NOT NULL DEFAULT 0,
  bx INTEGER NOT NULL DEFAULT 0,
  fs_try INTEGER NOT NULL DEFAULT 0,
  fs_ok INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, game, country, env)
);
CREATE INDEX launch_days_day ON launch_days (day);

CREATE TABLE launch_fails (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  reason TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country, reason)
);
CREATE INDEX launch_fails_day ON launch_fails (day);
