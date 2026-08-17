ALTER TABLE categories ADD COLUMN parent_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
