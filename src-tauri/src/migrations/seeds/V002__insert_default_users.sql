-- Migration: V002
-- Description: Insert default users
-- Type: seeds

INSERT OR IGNORE INTO users (id, email, password, name, role, permissions, created_at, last_login) VALUES
    (1, 'admin@danpos.com', '123456', 'Admin User', 'admin', '[\"*\"]', '2024-01-01T00:00:00.000Z', '2025-01-24T10:30:00.000Z'),
    (2, 'manager@danpos.com', '123456', 'Store Manager', 'manager', '[\"sales.view\",\"sales.create\",\"sales.edit\",\"products.view\",\"products.create\",\"products.edit\",\"products.delete\",\"inventory.view\",\"inventory.edit\",\"reports.view\",\"reports.export\",\"users.view\",\"users.create\",\"users.edit\",\"users.delete\"]', '2024-01-15T00:00:00.000Z', '2025-01-23T14:45:00.000Z'),
    (3, 'user@danpos.com', '123456', 'John Cashier', 'user', '[\"sales.view\",\"sales.create\",\"products.view\"]', '2024-02-01T00:00:00.000Z', '2025-01-24T09:00:00.000Z');
