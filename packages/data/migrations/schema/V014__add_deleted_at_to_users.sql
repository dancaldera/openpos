-- Migration: V014
-- Description: Add deleted at to users
-- Type: schema

ALTER TABLE users ADD COLUMN deleted_at DATETIME;
