-- Migration: V015
-- Description: Create customers table
-- Type: schema

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_number TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    phone_secondary TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'US',
    customer_type TEXT CHECK (customer_type IN ('individual', 'business')) DEFAULT 'individual',
    customer_segment TEXT,
    credit_limit REAL DEFAULT 0,
    current_balance REAL DEFAULT 0,
    tax_exempt BOOLEAN DEFAULT 0,
    tax_id TEXT,
    loyalty_points INTEGER DEFAULT 0,
    total_purchases REAL DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    first_purchase_date DATETIME,
    last_purchase_date DATETIME,
    is_active BOOLEAN DEFAULT 1,
    notes TEXT,
    tags TEXT,
    custom_fields TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    deleted_at DATETIME
);
CREATE INDEX idx_customers_customer_number ON customers(customer_number);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(last_name, first_name);
CREATE INDEX idx_customers_active ON customers(is_active);
