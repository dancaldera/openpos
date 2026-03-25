#!/usr/bin/env bun
/**
 * Bump version across multiple files in the project.
 *
 * Usage:
 *   bun run version:bump <version>
 *   bun run version:bump 0.3.0
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

interface FileToUpdate {
  path: string
  pattern: RegExp
  replacement: (version: string) => string
  name: string
}

const FILES_TO_UPDATE: FileToUpdate[] = [
  // Apps
  {
    name: 'Desktop app',
    path: resolve(repoRoot, 'apps/desktop/package.json'),
    pattern: /"version":\s*"[\d.]+"/,
    replacement: (version: string) => `"version": "${version}"`,
  },
  {
    name: 'API',
    path: resolve(repoRoot, 'apps/api/package.json'),
    pattern: /"version":\s*"[\d.]+"/,
    replacement: (version: string) => `"version": "${version}"`,
  },
  {
    name: 'Landing page',
    path: resolve(repoRoot, 'apps/landing/package.json'),
    pattern: /"version":\s*"[\d.]+"/,
    replacement: (version: string) => `"version": "${version}"`,
  },
]

async function bumpVersion(newVersion: string) {
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error(`Invalid version format: ${newVersion}`)
    console.error('Expected format: X.Y.Z (e.g., 0.3.0)')
    process.exit(1)
  }

  console.log(`Bumping version to ${newVersion}...\n`)

  const updatedFiles: string[] = []
  const skippedFiles: string[] = []
  const failedFiles: string[] = []

  for (const file of FILES_TO_UPDATE) {
    try {
      const content = await readFile(file.path, 'utf8')
      const updated = content.replace(file.pattern, file.replacement(newVersion))

      if (content === updated) {
        console.warn(`  ⚠️  ${file.name}: Version pattern not found or already updated`)
        skippedFiles.push(file.name)
        continue
      }

      await writeFile(file.path, updated)
      console.log(`  ✓ ${file.name}`)
      updatedFiles.push(file.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  ✗ ${file.name}: ${message}`)
      failedFiles.push(file.name)
    }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Version bump summary: v${newVersion}`)
  console.log(`${'─'.repeat(50)}`)

  if (updatedFiles.length > 0) {
    console.log(`\n✅ Updated (${updatedFiles.length}):`)
    for (const name of updatedFiles) {
      console.log(`   ${name}`)
    }
  }

  if (skippedFiles.length > 0) {
    console.log(`\n⚠️  Skipped (${skippedFiles.length}):`)
    for (const name of skippedFiles) {
      console.log(`   ${name}`)
    }
  }

  if (failedFiles.length > 0) {
    console.log(`\n❌ Failed (${failedFiles.length}):`)
    for (const name of failedFiles) {
      console.log(`   ${name}`)
    }
    process.exit(1)
  }

  console.log('\nNext steps:')
  console.log('  1. Review the changes with git diff')
  console.log(`  2. Commit: git add . && git commit -m "chore: bump version to v${newVersion}"`)
  console.log(`  3. Tag and push: git tag v${newVersion} && git push origin main --tags`)
}

const version = process.argv[2]

if (!version) {
  console.error('Usage: bun run version:bump <version>')
  console.error('Example: bun run version:bump 0.3.0')
  process.exit(1)
}

bumpVersion(version)
