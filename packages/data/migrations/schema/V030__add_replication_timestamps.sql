-- Migration: V030
-- Description: Add replication timestamps to users and order_items
-- Type: schema

ALTER TABLE users ADD COLUMN updated_at DATETIME;
UPDATE users SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);

ALTER TABLE order_items ADD COLUMN created_at DATETIME;
UPDATE order_items SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP);

ALTER TABLE order_items ADD COLUMN updated_at DATETIME;
UPDATE order_items SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);
