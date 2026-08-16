-- Migration: V012
-- Description: Add user id to orders
-- Type: schema

ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id);
