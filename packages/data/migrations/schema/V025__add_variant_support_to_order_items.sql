-- Migration: V025
-- Description: Add variant support to order_items table
-- Type: schema

ALTER TABLE order_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id);
ALTER TABLE order_items ADD COLUMN variant_attributes TEXT;
CREATE INDEX idx_order_items_variant ON order_items(variant_id);
