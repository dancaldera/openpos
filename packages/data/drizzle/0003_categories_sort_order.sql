ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
