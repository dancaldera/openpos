#!/usr/bin/env bun
/**
 * Turso Database Migration Script
 *
 * Reads all SQL migration files from src-tauri/src/migrations/ (schema + seeds),
 * applies them in version order to the Turso remote database, and tracks
 * applied migrations in a _migrations table so it's safe to re-run.
 *
 * Usage:
 *   bun run db:migrate
 *
 * Requires .env.local with:
 *   VITE_TURSO_DATABASE_URL=libsql://your-database.turso.io
 *   VITE_TURSO_AUTH_TOKEN=your-auth-token-here
 */

import { connect } from '@tursodatabase/serverless'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Load environment variables from .env.local
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim()
      env[key] = value
    }
    return env
  } catch {
    console.error('Error: could not read .env.local')
    process.exit(1)
    return {}
  }
}

// ---------------------------------------------------------------------------
// Parse migration metadata from SQL file header comments
// ---------------------------------------------------------------------------
interface MigrationMeta {
  version: number
  description: string
}

function parseMeta(content: string): MigrationMeta | null {
  let version: number | null = null
  let description: string | null = null

  for (const line of content.split('\n').slice(0, 20)) {
    const t = line.trim()
    if (t.startsWith('-- Migration: ')) {
      const raw = t.replace('-- Migration: ', '').trim()
      const num = raw.replace(/^V/, '')
      version = Number.parseInt(num, 10)
    } else if (t.startsWith('-- Description: ')) {
      description = t.replace('-- Description: ', '').trim()
    }
  }

  if (version !== null && !Number.isNaN(version) && description) {
    return { version, description }
  }
  return null
}

// ---------------------------------------------------------------------------
// Extract SQL body (skip header comment lines)
// ---------------------------------------------------------------------------
function extractSql(content: string): string {
  const lines = content.split('\n')
  let bodyStart = 0
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t && !t.startsWith('--')) {
      bodyStart = i
      break
    }
  }
  return lines.slice(bodyStart).join('\n').trim()
}

// ---------------------------------------------------------------------------
// Load migration files from a directory, sorted by filename
// ---------------------------------------------------------------------------
interface Migration {
  version: number
  description: string
  sql: string
  file: string
}

function loadMigrationsFromDir(dir: string): Migration[] {
  let files: string[]
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  } catch {
    return []
  }

  const migrations: Migration[] = []
  for (const file of files) {
    const fullPath = join(dir, file)
    const content = readFileSync(fullPath, 'utf-8')
    const meta = parseMeta(content)
    if (!meta) {
      console.warn(`  Warning: skipping ${file} — could not parse metadata`)
      continue
    }
    migrations.push({
      version: meta.version,
      description: meta.description,
      sql: extractSql(content),
      file,
    })
  }
  return migrations
}

// ---------------------------------------------------------------------------
// Split a SQL body into individual statements (naive semicolon split)
// ---------------------------------------------------------------------------
function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// ---------------------------------------------------------------------------
// Translate SQLite-specific syntax to libSQL-compatible syntax
// ---------------------------------------------------------------------------
function translateSql(sql: string): string {
  // libSQL supports INSERT OR IGNORE — keep as is
  // libSQL supports CREATE TABLE IF NOT EXISTS — keep as is
  // libSQL supports CREATE INDEX — keep as is
  // No translation needed for standard SQLite DDL/DML
  return sql
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('OpenPOS — Turso Migration Runner')
  console.log('=================================\n')

  // 1. Load credentials
  const env = loadEnv()
  const url = env.VITE_TURSO_DATABASE_URL
  const token = env.VITE_TURSO_AUTH_TOKEN

  if (!url || url === 'libsql://your-database.turso.io') {
    console.error('Error: VITE_TURSO_DATABASE_URL is not set in .env.local')
    console.error('  Edit .env.local and add your real Turso database URL.')
    process.exit(1)
  }
  if (!token || token === 'your-auth-token-here') {
    console.error('Error: VITE_TURSO_AUTH_TOKEN is not set in .env.local')
    console.error('  Edit .env.local and add your real Turso auth token.')
    process.exit(1)
  }

  console.log(`Connecting to: ${url}\n`)

  // 2. Connect to Turso
  const client = connect({ url, authToken: token })

  // 3. Ensure _migrations tracking table exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version   INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // 4. Load already-applied versions
  const applied = await client.execute('SELECT version FROM _migrations ORDER BY version')
  const appliedVersions = new Set<number>(
    (applied.rows as Array<{ version: number }>).map((r) => r.version),
  )

  if (appliedVersions.size > 0) {
    console.log(`Already applied: ${[...appliedVersions].sort((a, b) => a - b).join(', ')}\n`)
  }

  // 5. Collect all migrations from schema/ and seeds/
  const migrationsDir = resolve(process.cwd(), 'src-tauri', 'src', 'migrations')
  const schemaDir = join(migrationsDir, 'schema')
  const seedsDir = join(migrationsDir, 'seeds')

  const allMigrations = [
    ...loadMigrationsFromDir(schemaDir),
    ...loadMigrationsFromDir(seedsDir),
  ].sort((a, b) => a.version - b.version)

  console.log(`Found ${allMigrations.length} total migrations.\n`)

  // 6. Apply pending migrations
  let applied_count = 0
  let skipped_count = 0
  const errors: string[] = []

  for (const migration of allMigrations) {
    const pad = String(migration.version).padStart(3, '0')
    const label = `V${pad} — ${migration.description}`

    if (appliedVersions.has(migration.version)) {
      console.log(`  ✓ ${label} (already applied)`)
      skipped_count++
      continue
    }

    process.stdout.write(`  → ${label} ... `)

    try {
      const statements = splitStatements(translateSql(migration.sql))

      for (const stmt of statements) {
        await client.execute(stmt)
      }

      // Record migration as applied
      await client.execute(
        `INSERT INTO _migrations (version, description) VALUES (?, ?)`,
        [migration.version, migration.description],
      )

      console.log('done')
      applied_count++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FAILED\n    Error: ${msg}`)
      errors.push(`V${pad}: ${msg}`)
    }
  }

  // 7. Summary
  console.log('\n=================================')
  console.log(`Applied : ${applied_count}`)
  console.log(`Skipped : ${skipped_count}`)
  console.log(`Errors  : ${errors.length}`)

  if (errors.length > 0) {
    console.log('\nFailed migrations:')
    for (const e of errors) {
      console.log(`  - ${e}`)
    }
    process.exit(1)
  }

  console.log('\nAll migrations complete.')
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
