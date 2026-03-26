-- Migration: V032
-- Description: Add sync sentinel table for lightweight change detection
-- Type: schema

CREATE TABLE IF NOT EXISTS sync_metadata (id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO sync_metadata (id, version) VALUES (1, 0);
