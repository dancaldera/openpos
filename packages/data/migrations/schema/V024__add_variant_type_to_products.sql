-- Migration: V024
-- Description: Add variant_type column to products table
-- Type: schema

ALTER TABLE products ADD COLUMN variant_type TEXT DEFAULT 'simple' CHECK (variant_type IN ('simple', 'configurable'));
ALTER TABLE products ADD COLUMN default_variant_id INTEGER REFERENCES product_variants(id);
UPDATE products SET variant_type = 'simple' WHERE variant_type IS NULL;

CREATE INDEX idx_products_variant_type ON products(variant_type);
