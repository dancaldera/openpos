/**
 * Create Admin User (Interactive)
 *
 * pnpm run db:create-admin
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

export function loadEnv(path: string): Record<string, string> {
  const content = readFileSync(path, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

export interface CreateAdminClient {
  execute: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}

export interface CreateAdminDeps {
  envPath: string
  loadEnvFile: (path: string) => Record<string, string>
  createClient: (config: { url: string; authToken: string }) => CreateAdminClient
  hashPassword: (password: string) => Promise<string>
}

export async function runCreateAdmin(argv: string[], deps: CreateAdminDeps): Promise<void> {
  const email = argv[0] || 'admin@danpos.com'
  const name = argv[1] || 'Admin User'
  const password = argv[2] || 'admin123'

  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token } = deps.loadEnvFile(deps.envPath)
  if (!url || !token) {
    console.error('Error: create a store from the app, or import an existing database URL from Settings.')
    process.exit(1)
    return
  }

  console.warn(
    'Warning: create-admin using a URL/token is deprecated. Create stores from the app, then configure the database in Settings.',
  )

  const client = deps.createClient({ url, authToken: token })

  const existing = await client.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email.toLowerCase()])
  if (existing.rows.length > 0) {
    console.error(`Error: User already exists: ${email}`)
    process.exit(1)
    return
  }

  const hash = await deps.hashPassword(password)
  await client.execute(
    `INSERT INTO users (email, password, name, role, permissions, created_at, password_hashed)
     VALUES (?, ?, ?, 'admin', '["*"]', ?, 1)`,
    [email.toLowerCase(), hash, name, new Date().toISOString()],
  )

  console.log(`\n✅ Created: ${email}`)
}

export function reportFailure(err: unknown): never {
  console.error('Error:', (err as Error).message)
  process.exit(1)
}

/* c8 ignore next: production entrypoint (tests call runCreateAdmin directly). */
if (!process.env.VITEST) {
  await runCreateAdmin(process.argv.slice(2), {
    envPath: resolve(repoRoot, 'apps/api/.env'),
    loadEnvFile: loadEnv,
    createClient,
    hashPassword: (password) => bcrypt.hash(password, 12),
  }).catch(reportFailure)
}
