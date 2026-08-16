-- Migration: V029
-- Description: Add normalized barcode columns
-- Type: schema

ALTER TABLE products ADD COLUMN barcode_normalized TEXT;
ALTER TABLE product_variants ADD COLUMN barcode_normalized TEXT;

UPDATE products
SET barcode_normalized = REPLACE(REPLACE(REPLACE(REPLACE(TRIM(barcode), ' ', ''), CHAR(10), ''), CHAR(13), ''), CHAR(9), '')
WHERE barcode IS NOT NULL AND TRIM(barcode) != '';

UPDATE product_variants
SET barcode_normalized = REPLACE(REPLACE(REPLACE(REPLACE(TRIM(barcode), ' ', ''), CHAR(10), ''), CHAR(13), ''), CHAR(9), '')
WHERE barcode IS NOT NULL AND TRIM(barcode) != '';

CREATE UNIQUE INDEX idx_products_barcode_normalized_unique
ON products(barcode_normalized)
WHERE barcode_normalized IS NOT NULL;

CREATE UNIQUE INDEX idx_product_variants_barcode_normalized_unique
ON product_variants(barcode_normalized)
WHERE barcode_normalized IS NOT NULL;
