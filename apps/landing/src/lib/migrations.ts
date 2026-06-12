import { createClient, type Client } from '@libsql/client'

const MIGRATIONS_TABLE = '__drizzle_migrations'

const migrationFiles = import.meta.glob('../../../../packages/data/drizzle/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

interface MigrationFile {
  name: string
  sql: string
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

function loadBundledMigrations(): MigrationFile[] {
  return Object.entries(migrationFiles)
    .filter(([path]) => !path.includes('/dev/'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, sql]) => ({
      name: path.split('/').pop()!.replace('.sql', ''),
      sql: sql.trim(),
    }))
}

async function executeWithRetry(client: Client, sql: string, attempts = 5): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await client.execute(sql)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to execute migration statement')
}

export async function applyMigrations(url: string, authToken: string): Promise<{ applied: number; skipped: number }> {
  const client = createClient({ url, authToken })
  const migrations = loadBundledMigrations()

  try {
    await executeWithRetry(
      client,
      `
        CREATE TABLE IF NOT EXISTS ${quoteIdentifier(MIGRATIONS_TABLE)} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `,
    )

    const appliedResult = await client.execute(
      `SELECT name FROM ${quoteIdentifier(MIGRATIONS_TABLE)} ORDER BY id ASC`,
    )
    const applied = new Set(
      appliedResult.rows.map((row) => {
        if (Array.isArray(row)) return String(row[0])
        return String((row as Record<string, unknown>).name)
      }),
    )

    let appliedCount = 0
    let skippedCount = 0

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        skippedCount += 1
        continue
      }

      for (const statement of splitStatements(migration.sql)) {
        await executeWithRetry(client, statement)
      }

      await client.execute({
        sql: `INSERT INTO ${quoteIdentifier(MIGRATIONS_TABLE)} (name) VALUES (?)`,
        args: [migration.name],
      })
      appliedCount += 1
    }

    return { applied: appliedCount, skipped: skippedCount }
  } finally {
    client.close()
  }
}

export function getBundledMigrationCount(): number {
  return loadBundledMigrations().length
}
