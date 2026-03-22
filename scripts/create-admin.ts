#!/usr/bin/env bun

/**
 * Create Admin User (Interactive)
 *
 * bun run db:create-admin
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { connect } from '@tursodatabase/serverless'
import bcrypt from 'bcryptjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

function loadEnv(): Record<string, string> {
  const content = readFileSync(resolve(repoRoot, '.env.local'), 'utf-8')
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
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  console.log('Create Admin User\n')

  const email = await rl.question('Email [admin@danpos.com]: ')
  const name = await rl.question('Name [Admin User]: ')
  const password = await rl.question('Password [admin123]: ')
  rl.close()

  const finalEmail = email.trim() || 'admin@danpos.com'
  const finalName = name.trim() || 'Admin User'
  const finalPassword = password.trim() || 'admin123'

  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token } = loadEnv()
  if (!url || !token) {
    console.error('Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required in .env.local')
    process.exit(1)
  }

  const client = connect({ url, authToken: token })

  const existing = await client.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [finalEmail.toLowerCase()])
  if (existing.rows.length > 0) {
    console.error(`Error: User already exists: ${finalEmail}`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(finalPassword, 12)
  await client.execute(
    `INSERT INTO users (email, password, name, role, permissions, created_at, password_hashed)
     VALUES (?, ?, ?, 'admin', '["*"]', ?, 1)`,
    [finalEmail.toLowerCase(), hash, finalName, new Date().toISOString()],
  )

  console.log(`\n✅ Created: ${finalEmail}`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
