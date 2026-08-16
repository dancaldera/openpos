-- Migration: V031
-- Description: Add indexes on updated_at for all replicated tables to optimize change detection
-- Type: schema

CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_company_settings_updated_at ON company_settings(updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_order_items_updated_at ON order_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_product_attributes_updated_at ON product_attributes(updated_at);
CREATE INDEX IF NOT EXISTS idx_product_variants_updated_at ON product_variants(updated_at);
CREATE INDEX IF NOT EXISTS idx_product_variant_settings_updated_at ON product_variant_settings(updated_at);
