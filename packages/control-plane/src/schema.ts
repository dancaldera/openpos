import type { SqlClient } from './sql.ts'

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    connection_key TEXT NOT NULL UNIQUE,
    database_name TEXT NOT NULL UNIQUE,
    database_url TEXT NOT NULL,
    database_token_encrypted TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS store_domains (
    hostname TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_store_domains_store ON store_domains (store_id)',
  `CREATE TABLE IF NOT EXISTS root_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT,
    action TEXT NOT NULL,
    target TEXT,
    created_at TEXT NOT NULL
  )`,
]

const ready = new WeakMap<SqlClient, Promise<void>>()

/** Create control-plane tables once per client (idempotent). */
export function ensureControlPlaneSchema(db: SqlClient): Promise<void> {
  let pending = ready.get(db)
  if (!pending) {
    pending = (async () => {
      for (const statement of STATEMENTS) {
        await db.execute(statement)
      }
    })()
    pending.catch(() => ready.delete(db))
    ready.set(db, pending)
  }
  return pending
}
