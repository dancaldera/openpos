/**
 * Loads `apps/releases/.env` into `process.env` when present.
 * Existing variables (Railway, the shell) are not overwritten.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function applyEnvFile(path: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(path)) return

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue

    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (env[key] === undefined) env[key] = value
  }
}

export function loadLocalEnv(env: NodeJS.ProcessEnv = process.env): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env')
  applyEnvFile(envPath, env)
}
