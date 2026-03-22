-- Migration: V022
-- Description: Create product_variants table
-- Type: schema

CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_product_id INTEGER NOT NULL,
    sku TEXT UNIQUE,
    barcode TEXT UNIQUE,
    price REAL NOT NULL,
    cost REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    attributes TEXT NOT NULL,
    image TEXT,
    is_active BOOLEAN DEFAULT 1,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_variants_parent ON product_variants(parent_product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
CREATE INDEX idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX idx_product_variants_active ON product_variants(is_active);
