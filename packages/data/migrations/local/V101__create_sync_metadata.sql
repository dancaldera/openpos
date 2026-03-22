-- Migration: V101
-- Description: Create local sync metadata tables
-- Type: local

CREATE TABLE IF NOT EXISTS sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    row_payload TEXT,
    local_updated_at DATETIME,
    base_remote_updated_at DATETIME,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'conflict', 'error')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    synced_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(table_name, record_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_updated_at ON sync_outbox(updated_at);

CREATE TABLE IF NOT EXISTS sync_state (
    table_name TEXT PRIMARY KEY,
    last_pulled_at DATETIME,
    last_sync_at DATETIME,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
