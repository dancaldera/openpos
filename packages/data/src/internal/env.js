const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const env = {}

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }

  return env
}

function getDefaultEnvCandidates(repoRoot = process.cwd()) {
  return [
    resolve(repoRoot, '.env'),
    resolve(repoRoot, '.env.local'),
    resolve(repoRoot, 'apps/api/.env'),
    resolve(repoRoot, 'apps/api/.env.local'),
    resolve(repoRoot, 'apps/desktop/.env'),
    resolve(repoRoot, 'apps/desktop/.env.local'),
  ]
}

function loadEnv(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd()
  const candidates = options.candidates ?? getDefaultEnvCandidates(repoRoot)
  const mergedEnv = {}

  for (const envPath of candidates) {
    try {
      Object.assign(mergedEnv, parseEnvFile(envPath))
    } catch {
      // Ignore missing env files.
    }
  }

  return {
    ...mergedEnv,
    ...process.env,
  }
}

module.exports = {
  getDefaultEnvCandidates,
  loadEnv,
  parseEnvFile,
}
