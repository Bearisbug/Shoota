-- 匿名统计与看板登录防护，字段口径见 docs/DESIGN.md §7、§9
CREATE TABLE visitors (
  vid TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  device TEXT NOT NULL,
  wechat INTEGER NOT NULL,
  country TEXT NOT NULL
);
CREATE INDEX visitors_first_day ON visitors (first_day);

CREATE TABLE visitor_days (
  vid TEXT NOT NULL,
  day TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  backups INTEGER NOT NULL DEFAULT 0,
  restores INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vid, day)
);
CREATE INDEX visitor_days_day ON visitor_days (day);

CREATE TABLE game_days (
  vid TEXT NOT NULL,
  game TEXT NOT NULL,
  day TEXT NOT NULL,
  starts INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vid, game, day)
);
CREATE INDEX game_days_day ON game_days (day);

CREATE TABLE login_guards (
  ip_hash TEXT PRIMARY KEY,
  fails INTEGER NOT NULL,
  locked_until INTEGER
);
