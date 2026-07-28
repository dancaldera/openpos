CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'nxm')),
  percent REAL,
  buy_n INTEGER,
  pay_m INTEGER,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('all', 'category', 'product')),
  scope_value TEXT,
  combinable INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);
CREATE INDEX IF NOT EXISTS idx_promotions_scope ON promotions(scope_type, scope_value);
CREATE INDEX IF NOT EXISTS idx_promotions_updated_at ON promotions(updated_at);
