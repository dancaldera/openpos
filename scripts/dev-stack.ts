import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const API_PORT = 3001
export const ADMIN_PORT = 3002
export const WEB_PORT = 5173
export const DEV_DATA_DIRNAME = '.dev-data'

export interface DevSecrets {
  controlPlaneSecret: string
  jwtSecret: string
  internalSecret: string
  adminSessionSecret: string
}

const SECRET_KEYS: Array<keyof DevSecrets> = ['controlPlaneSecret', 'jwtSecret', 'internalSecret', 'adminSessionSecret']

export function randomSecret(): string {
  return randomBytes(32).toString('base64url')
}

/** Secrets for the local stack, generated once so local databases stay readable between runs. */
export function loadDevSecrets(dataDir: string, generate: () => string = randomSecret): DevSecrets {
  const path = join(dataDir, 'secrets.json')
  let stored: Partial<DevSecrets> = {}
  if (existsSync(path)) {
    try {
      stored = JSON.parse(readFileSync(path, 'utf8')) as Partial<DevSecrets>
    } catch {
      stored = {}
    }
  }
  const secrets = Object.fromEntries(
    SECRET_KEYS.map((key) => [key, typeof stored[key] === 'string' && stored[key] ? stored[key] : generate()]),
  ) as unknown as DevSecrets
  if (SECRET_KEYS.some((key) => stored[key] !== secrets[key])) {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(path, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 })
  }
  return secrets
}

/**
 * Environment for the local API, admin, and web servers: a file-backed control
 * plane with stores at <slug>.localhost. Variables already set win, so a
 * developer can point the stack at Turso by exporting them.
 */
export function buildStackEnv(rootDir: string, baseEnv: NodeJS.ProcessEnv, generate?: () => string): NodeJS.ProcessEnv {
  const dataDir = join(rootDir, DEV_DATA_DIRNAME)
  const secrets = loadDevSecrets(dataDir, generate)
  const defaults: NodeJS.ProcessEnv = {
    CONTROL_PLANE_URL: `file:${join(dataDir, 'control-plane.sqlite')}`,
    CONTROL_PLANE_SECRET: secrets.controlPlaneSecret,
    JWT_SECRET: secrets.jwtSecret,
    INTERNAL_SECRET: secrets.internalSecret,
    ADMIN_SESSION_SECRET: secrets.adminSessionSecret,
    STORE_BASE_DOMAINS: 'localhost',
    LOCAL_DATABASES_DIR: join(dataDir, 'stores'),
    PORT: String(API_PORT),
    ADMIN_PORT: String(ADMIN_PORT),
    PUBLIC_API_URL: `http://localhost:${API_PORT}`,
    STORE_WEB_URL_TEMPLATE: `http://{slug}.localhost:${WEB_PORT}`,
  }
  return { ...defaults, ...baseEnv }
}
