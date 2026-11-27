/**
 * Push Worker secrets from the environment to Cloudflare.
 *
 * Each Worker has its own ID vault project, the source of truth for its
 * secrets: `pos/openpos-api` and `pos/openpos-admin`, environment `prod`.
 * Run this through `idv run` so values go straight from the vault into
 * `wrangler secret put` (on stdin) and never touch disk or the terminal:
 *
 *   pnpm run secrets:push:api
 *   pnpm run secrets:push:admin
 *   pnpm run secrets:push:admin --only ADMIN_SESSION_SECRET
 *   pnpm run secrets:push:api --dry-run   # show the plan without pushing
 *
 * Keys missing from the environment are skipped and reported.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Secrets each Worker reads. Plain settings live in apps/<worker>/wrangler.jsonc. */
export const WORKER_SECRETS = {
  api: ['CONTROL_PLANE_AUTH_TOKEN', 'CONTROL_PLANE_SECRET', 'CONTROL_PLANE_URL', 'INTERNAL_SECRET', 'JWT_SECRET'],
  admin: [
    'ADMIN_SESSION_SECRET',
    'CLOUDFLARE_API_TOKEN',
    'CONTROL_PLANE_AUTH_TOKEN',
    'CONTROL_PLANE_SECRET',
    'CONTROL_PLANE_URL',
    'TURSO_API_TOKEN',
  ],
} as const satisfies Record<string, readonly string[]>

export type WorkerName = keyof typeof WORKER_SECRETS

export interface PushOptions {
  workers: WorkerName[]
  only: string[] | null
  dryRun: boolean
}

export interface PushPlan {
  worker: WorkerName
  push: string[]
  missing: string[]
}

export function parseArgs(argv: string[]): PushOptions {
  const workers: WorkerName[] = []
  let only: string[] | null = null
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--worker') {
      const name = argv[++i]
      if (!name || !(name in WORKER_SECRETS)) {
        throw new Error(`--worker must be one of: ${Object.keys(WORKER_SECRETS).join(', ')}`)
      }
      workers.push(name as WorkerName)
    } else if (arg === '--only') {
      only = (argv[++i] ?? '')
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
      if (!only.length) throw new Error('--only needs a comma-separated list of secret names')
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return { workers: workers.length ? workers : (Object.keys(WORKER_SECRETS) as WorkerName[]), only, dryRun }
}

export function planPush(options: PushOptions, env: Record<string, string | undefined>): PushPlan[] {
  if (options.only) {
    const known = new Set<string>(options.workers.flatMap((worker) => WORKER_SECRETS[worker]))
    const unknown = options.only.filter((key) => !known.has(key))
    if (unknown.length) throw new Error(`Not a secret of the selected Workers: ${unknown.join(', ')}`)
  }
  return options.workers.map((worker) => {
    const keys: string[] = WORKER_SECRETS[worker].filter((key) => !options.only || options.only.includes(key))
    return {
      worker,
      push: keys.filter((key) => env[key]?.trim()),
      missing: keys.filter((key) => !env[key]?.trim()),
    }
  })
}

function putSecret(worker: WorkerName, key: string, value: string): boolean {
  const result = spawnSync('pnpm', ['-C', `apps/${worker}`, 'exec', 'wrangler', 'secret', 'put', key], {
    cwd: repoRoot,
    input: value,
    stdio: ['pipe', 'ignore', 'inherit'],
  })
  return result.status === 0
}

export function runPush(argv: string[], env: Record<string, string | undefined>): number {
  const options = parseArgs(argv)
  let failed = 0
  for (const plan of planPush(options, env)) {
    console.log(`${plan.worker}: ${plan.push.length ? plan.push.join(', ') : 'nothing to push'}`)
    if (plan.missing.length) console.log(`  not in the environment, skipped: ${plan.missing.join(', ')}`)
    if (options.dryRun) continue
    for (const key of plan.push) {
      const ok = putSecret(plan.worker, key, env[key]?.trim() ?? '')
      console.log(`  ${ok ? 'pushed' : 'FAILED'} ${key}`)
      if (!ok) failed++
    }
  }
  return failed ? 1 : 0
}

/* c8 ignore next: production entrypoint (tests call runPush helpers directly). */
if (!process.env.VITEST) {
  try {
    process.exitCode = runPush(process.argv.slice(2), process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
