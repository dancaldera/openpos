-- Migration: V003
-- Description: Add password hashed column
-- Type: schema

ALTER TABLE users ADD COLUMN password_hashed BOOLEAN NOT NULL DEFAULT 0;
