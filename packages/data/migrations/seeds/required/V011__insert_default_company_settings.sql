-- Migration: V011
-- Description: Insert default company settings
-- Type: seeds

INSERT OR IGNORE INTO company_settings (id, name, app_name, description, tax_enabled, tax_percentage, currency_symbol, language, created_at, updated_at) VALUES
    (1, 'Titanic POS', 'OpenPOS', 'Modern Point of Sale System', 1, 10.0, '$', 'en', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
