-- 老玩家标记：领旅客编号时本机已有平台数据（统计上线前就玩过）记为 1，口径见 docs/DESIGN.md §9
ALTER TABLE visitors ADD COLUMN prior INTEGER NOT NULL DEFAULT 0;
