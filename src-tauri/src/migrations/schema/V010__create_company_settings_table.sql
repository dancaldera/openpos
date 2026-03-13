-- Migration: V010
-- Description: Create company settings table
-- Type: schema

CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'Titanic POS',
    app_name TEXT NOT NULL DEFAULT 'OpenPOS',
    description TEXT DEFAULT 'Modern Point of Sale System',
    tax_enabled BOOLEAN DEFAULT 1,
    tax_percentage REAL DEFAULT 10.0,
    currency_symbol TEXT DEFAULT '$',
    language TEXT DEFAULT 'en',
    logo_url TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
