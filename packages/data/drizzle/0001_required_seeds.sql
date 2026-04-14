INSERT OR IGNORE INTO users (id, email, password, name, role, permissions, created_at, last_login) VALUES
  (1, 'admin@danpos.com', '123456', 'Admin User', 'admin', '["*"]', '2024-01-01T00:00:00.000Z', '2025-01-24T10:30:00.000Z'),
  (2, 'manager@danpos.com', '123456', 'Store Manager', 'manager', '["sales.view","sales.create","sales.edit","products.view","products.create","products.edit","products.delete","inventory.view","inventory.edit","reports.view","reports.export","users.view","users.create","users.edit","users.delete"]', '2024-01-15T00:00:00.000Z', '2025-01-23T14:45:00.000Z'),
  (3, 'user@danpos.com', '123456', 'John Cashier', 'user', '["sales.view","sales.create","products.view"]', '2024-02-01T00:00:00.000Z', '2025-01-24T09:00:00.000Z');

INSERT OR IGNORE INTO company_settings (id, name, app_name, description, tax_enabled, tax_percentage, currency_symbol, language, created_at, updated_at) VALUES
  (1, 'Titanic POS', 'OpenPOS', 'Modern Point of Sale System', 1, 10.0, '$', 'en', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

UPDATE orders SET user_id = 1 WHERE user_id IS NULL;

INSERT OR IGNORE INTO product_attributes (id, name, slug, "values", is_active, created_at, updated_at) VALUES
  (1, 'Color', 'color', '["Red","Blue","Green","Yellow","Black","White","Orange","Purple","Pink","Brown","Gray","Navy","Beige"]', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, 'Size', 'size', '["XS","S","M","L","XL","XXL","3XL"]', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, 'Material', 'material', '["Cotton","Polyester","Wool","Silk","Denim","Leather","Canvas","Nylon"]', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, 'Style', 'style', '["Casual","Formal","Sport","Classic","Modern","Vintage"]', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
