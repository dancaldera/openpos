-- Migration: V028
-- Description: Add receipt_footer column to company_settings
-- Type: schema
-- Created: 2026-03-16

ALTER TABLE company_settings ADD COLUMN receipt_footer TEXT;
