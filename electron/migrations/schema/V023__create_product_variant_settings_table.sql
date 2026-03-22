-- Migration: V023
-- Description: Create product_variant_settings table
-- Type: schema

CREATE TABLE IF NOT EXISTS product_variant_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL UNIQUE,
    has_variants BOOLEAN DEFAULT 0,
    attribute_ids TEXT NOT NULL,
    variant_name_template TEXT,
    pricing_strategy TEXT DEFAULT 'individual',
    price_adjustment_formula TEXT,
    stock_strategy TEXT DEFAULT 'individual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_variant_settings_product ON product_variant_settings(product_id);
