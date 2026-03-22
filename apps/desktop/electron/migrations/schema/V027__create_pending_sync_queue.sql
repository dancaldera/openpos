-- Migration: V027
-- Description: Create pending sync queue for offline write reconciliation
-- Type: schema
-- Created: 2026-03-16

CREATE TABLE IF NOT EXISTS pending_sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name TEXT NOT NULL,
  record_id TEXT,
  payload TEXT NOT NULL,
  sql_statement TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_pending_sync_queue_synced_at
  ON pending_sync_queue (synced_at);
