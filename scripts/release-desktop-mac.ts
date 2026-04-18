#!/usr/bin/env bun

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

interface WorkspaceVersion {
  label: string
  path: string
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const desktopDir = join(repoRoot, 'apps/desktop')
const desktopDistDir = join(desktopDir, 'dist-electron')
const macArtifactExtensions = new Set(['.dmg', '.zip', '.blockmap'])
const packageFiles: WorkspaceVersion[] = [
  { label: 'root', path: join(repoRoot, 'package.json') },
  { label: 'desktop', path: join(desktopDir, 'package.json') },
  { label: 'api', path: join(repoRoot, 'apps/api/package.json') },
  { label: 'landing', path: join(repoRoot, 'apps/landing/package.json') },
]

function printUsage(): void {
  console.log('Usage: bun run release:desktop:mac [--skip-check] [--dry-run]')
  console.log('')
  console.log('Builds the local macOS desktop release artifacts (.dmg and .zip).')
}

function parseFlags(argv: string[]) {
  const flagSet = new Set(argv)

  if (flagSet.has('--help') || flagSet.has('-h')) {
    printUsage()
    process.exit(0)
  }

  for (const arg of flagSet) {
    if (!['--skip-check', '--dry-run'].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return {
    dryRun: flagSet.has('--dry-run'),
    skipCheck: flagSet.has('--skip-check'),
  }
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    })

    child.once('error', rejectCommand)
    child.once('exit', (code, signal) => {
      if (signal) {
        rejectCommand(new Error(`${command} ${args.join(' ')} terminated with signal ${signal}`))
        return
      }

      if ((code ?? 0) !== 0) {
        rejectCommand(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 0}`))
        return
      }

      resolveCommand()
    })
  })
}

async function readVersion(path: string): Promise<string> {
  const content = await readFile(path, 'utf8')
  const parsed = JSON.parse(content) as { version?: unknown }

  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(`Missing version in ${path}`)
  }

  return parsed.version
}

async function ensureVersionsMatch(): Promise<string> {
  const versions = await Promise.all(
    packageFiles.map(async ({ label, path }) => ({
      label,
      path,
      version: await readVersion(path),
    })),
  )

  const expected = versions[0]?.version
  if (!expected) {
    throw new Error('Unable to determine release version')
  }

  for (const entry of versions) {
    if (entry.version !== expected) {
      throw new Error(
        `Version mismatch: expected ${expected}, but ${entry.label} at ${entry.path} is ${entry.version}`,
      )
    }
  }

  return expected
}

async function listMacArtifacts(): Promise<string[]> {
  const entries = await readdir(desktopDistDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && [...macArtifactExtensions].some((ext) => entry.name.endsWith(ext)))
    .map((entry) => join(desktopDistDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

async function main(): Promise<void> {
  const { dryRun, skipCheck } = parseFlags(process.argv.slice(2))

  if (process.platform !== 'darwin') {
    throw new Error('This release script only runs on macOS')
  }

  const version = await ensureVersionsMatch()
  console.log(`Preparing local macOS release for OpenPOS v${version}`)

  if (!skipCheck) {
    console.log('\nRunning repository checks...')
    await runCommand('bun', ['run', 'check'], repoRoot)
  }

  console.log('\nDesktop macOS build command:')
  console.log('bun run build:desktop:mac')

  if (dryRun) {
    console.log('\nDry run complete. No artifacts were built.')
    return
  }

  console.log('\nBuilding macOS artifacts...')
  await runCommand('bun', ['run', 'build:desktop:mac'], repoRoot)

  const artifacts = await listMacArtifacts()
  if (artifacts.length === 0) {
    throw new Error(`No macOS release artifacts were produced in ${desktopDistDir}`)
  }

  console.log('\nGenerated artifacts:')
  for (const artifact of artifacts) {
    console.log(`- ${artifact}`)
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nRelease failed: ${message}`)
  process.exit(1)
})
