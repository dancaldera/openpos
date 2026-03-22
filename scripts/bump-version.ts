#!/usr/bin/env bun
/**
 * Bump version across multiple files in the project.
 *
 * Usage:
 *   bun run scripts/bump-version.ts <version>
 *   bun run scripts/bump-version.ts 0.3.0
 */

const FILES_TO_UPDATE = [
  {
    path: 'package.json',
    pattern: /"version":\s*"[\d.]+"/,
    replacement: (version: string) => `"version": "${version}"`,
  },
  {
    path: '.github/workflows/release.yml',
    pattern: /^(\s*APP_VERSION:\s*)[\d.]+$/m,
    replacement: (version: string) => `$1${version}`,
  },
]

async function bumpVersion(newVersion: string) {
  // Validate version format
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error(`Invalid version format: ${newVersion}`)
    console.error('Expected format: X.Y.Z (e.g., 0.3.0)')
    process.exit(1)
  }

  console.log(`Bumping version to ${newVersion}...\n`)

  for (const file of FILES_TO_UPDATE) {
    const filePath = file.path

    try {
      const content = await Bun.file(filePath).text()
      const updated = content.replace(file.pattern, file.replacement(newVersion))

      if (content === updated) {
        console.warn(`⚠️  ${filePath}: Version pattern not found or already updated`)
        continue
      }

      await Bun.write(filePath, updated)
      console.log(`✓ Updated ${filePath}`)
    } catch (error) {
      console.error(`✗ Failed to update ${filePath}:`, error)
      process.exit(1)
    }
  }

  console.log(`\n✅ Successfully bumped version to ${newVersion}`)
  console.log('\nFiles updated:')
  FILES_TO_UPDATE.forEach((f) => console.log(`  - ${f.path}`))
  console.log('\nNext steps:')
  console.log('  1. Review the changes')
  console.log('  2. Commit: git add . && git commit -m "chore: bump version to v' + newVersion + '"')
  console.log(`  3. Tag and release: git tag v${newVersion} && git push origin v${newVersion}`)
}

// Main
const version = process.argv[2]

if (!version) {
  console.error('Usage: bun run scripts/bump-version.ts <version>')
  console.error('Example: bun run scripts/bump-version.ts 0.3.0')
  process.exit(1)
}

bumpVersion(version)
