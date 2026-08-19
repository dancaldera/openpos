-- Migration: V034
-- Description: Create password reset email settings table
-- Type: schema

CREATE TABLE IF NOT EXISTS password_reset_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    resend_api_key_encrypted TEXT,
    from_email TEXT,
    web_app_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
