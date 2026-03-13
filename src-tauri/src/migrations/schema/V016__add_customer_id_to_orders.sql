-- Migration: V016
-- Description: Add customer id to orders
-- Type: schema

ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
