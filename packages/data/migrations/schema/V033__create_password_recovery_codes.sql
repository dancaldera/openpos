-- Migration: V033
-- Description: Create password recovery codes table
-- Type: schema

CREATE TABLE IF NOT EXISTS password_recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_recovery_codes_code_hash_unique
    ON password_recovery_codes (code_hash);

CREATE INDEX IF NOT EXISTS idx_password_recovery_codes_user_id ON password_recovery_codes (user_id);
