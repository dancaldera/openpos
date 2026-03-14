-- Migration: V026
-- Description: Insert default product attributes
-- Type: seeds

INSERT OR IGNORE INTO product_attributes (id, name, slug, values, is_active, created_at, updated_at) VALUES
    (1, 'Color', 'color', '["Red","Blue","Green","Yellow","Black","White","Orange","Purple","Pink","Brown","Gray","Navy","Beige"]', 1, datetime('now'), datetime('now')),
    (2, 'Size', 'size', '["XS","S","M","L","XL","XXL","3XL"]', 1, datetime('now'), datetime('now')),
    (3, 'Material', 'material', '["Cotton","Polyester","Wool","Silk","Denim","Leather","Canvas","Nylon"]', 1, datetime('now'), datetime('now')),
    (4, 'Style', 'style', '["Casual","Formal","Sport","Classic","Modern","Vintage"]', 1, datetime('now'), datetime('now'));
