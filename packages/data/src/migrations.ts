import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LoadedSqlFile {
  version: number
  description: string
  file: string
  fullPath: string
  sql: string
}

const moduleDir = dirname(fileURLToPath(import.meta.url))
export const packageRoot = resolve(moduleDir, '..')
export const repoRoot = resolve(packageRoot, '../..')

function parseEnvFile(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, 'utf-8')
  const env: Record<string, string> = {}

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }

  return env
}

export function loadEnv(): Record<string, string> {
  const candidates = [
    resolve(repoRoot, '.env'),
    resolve(repoRoot, '.env.local'),
    resolve(repoRoot, 'apps/api/.env'),
    resolve(repoRoot, 'apps/api/.env.local'),
    resolve(repoRoot, 'apps/desktop/.env'),
    resolve(repoRoot, 'apps/desktop/.env.local'),
  ]

  const mergedEnv: Record<string, string> = {}

  for (const envPath of candidates) {
    try {
      Object.assign(mergedEnv, parseEnvFile(envPath))
    } catch {
      // Ignore missing env files and keep searching.
    }
  }

  return mergedEnv
}

function parseMeta(content: string): Pick<LoadedSqlFile, 'version' | 'description'> | null {
  let version: number | null = null
  let description: string | null = null

  for (const line of content.split('\n').slice(0, 20)) {
    const trimmed = line.trim()

    if (trimmed.startsWith('-- Migration: ')) {
      version = Number.parseInt(trimmed.replace('-- Migration: ', '').replace(/^V/, ''), 10)
      continue
    }

    if (trimmed.startsWith('-- Description: ')) {
      description = trimmed.replace('-- Description: ', '').trim()
    }
  }

  if (version === null || Number.isNaN(version) || !description) {
    return null
  }

  return { version, description }
}

function extractSql(content: string): string {
  const lines = content.split('\n')
  let bodyStart = 0

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (trimmed && !trimmed.startsWith('--')) {
      bodyStart = i
      break
    }
  }

  return lines.slice(bodyStart).join('\n').trim()
}

export function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

export function loadSqlDirectory(dirPath: string): LoadedSqlFile[] {
  let files: string[] = []

  try {
    files = readdirSync(dirPath)
      .filter((file) => file.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }

  return files.flatMap((file) => {
    const fullPath = join(dirPath, file)
    const content = readFileSync(fullPath, 'utf-8')
    const meta = parseMeta(content)

    if (!meta) {
      console.warn(`Skipping ${fullPath}: missing migration metadata`)
      return []
    }

    return [
      {
        ...meta,
        file,
        fullPath,
        sql: extractSql(content),
      },
    ]
  })
}

export function getMigrationsRoot(): string {
  return resolve(packageRoot, 'migrations')
}

export function loadRemoteMigrations(options: { includeDevSeeds?: boolean } = {}): LoadedSqlFile[] {
  const migrationsRoot = getMigrationsRoot()
  const schema = loadSqlDirectory(join(migrationsRoot, 'schema'))
  const requiredSeeds = loadSqlDirectory(join(migrationsRoot, 'seeds', 'required'))
  const devSeeds = options.includeDevSeeds ? loadSqlDirectory(join(migrationsRoot, 'seeds', 'dev')) : []

  return [...schema, ...requiredSeeds, ...devSeeds].sort((left, right) => left.version - right.version)
}

export function loadBootstrapMigrations(): LoadedSqlFile[] {
  const migrationsRoot = getMigrationsRoot()
  const schema = loadSqlDirectory(join(migrationsRoot, 'schema'))
  const requiredSeeds = loadSqlDirectory(join(migrationsRoot, 'seeds', 'required'))
  const localRuntime = loadSqlDirectory(join(migrationsRoot, 'local'))

  return [...schema, ...requiredSeeds, ...localRuntime].sort((left, right) => left.version - right.version)
}
