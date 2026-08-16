#!/usr/bin/env bun

/**
 * Create Admin User (Interactive)
 *
 * bun run db:create-admin
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { fileURLToPath } from 'node:url'
import { connect } from '@tursodatabase/serverless'
import bcrypt from 'bcryptjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

function loadEnv(path: string): Record<string, string> {
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

async function main() {
  const envPath = resolve(repoRoot, 'apps/api/.env')

  const email = process.argv[2] || 'admin@danpos.com'
  const name = process.argv[3] || 'Admin User'
  const password = process.argv[4] || 'admin123'

  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token } = loadEnv(envPath)
  if (!url || !token) {
    console.error('Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required in apps/api/.env')
    process.exit(1)
  }

  const client = connect({ url, authToken: token })

  const existing = await client.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email.toLowerCase()])
  if (existing.rows.length > 0) {
    console.error(`Error: User already exists: ${email}`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 12)
  await client.execute(
    `INSERT INTO users (email, password, name, role, permissions, created_at, password_hashed)
     VALUES (?, ?, ?, 'admin', '["*"]', ?, 1)`,
    [email.toLowerCase(), hash, name, new Date().toISOString()],
  )

  console.log(`\n✅ Created: ${email}`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
