import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bumpVersion, FILES_TO_UPDATE, type FileToUpdate, runBumpVersion } from './bump-version.js'

const tempDirs: string[] = []

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation(((() => {}) as unknown) as never)
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-bump-version-'))
  tempDirs.push(dir)
  return dir
}

function packageFile(dir: string, name: string, version: string): FileToUpdate {
  const path = join(dir, `${name}.json`)
  writeFileSync(path, `{\n  "name": "${name}",\n  "version": "${version}"\n}\n`)
  return {
    name,
    path,
    pattern: /"version":\s*"[\d.]+"/,
    replacement: (next: string) => `"version": "${next}"`,
  }
}

describe('FILES_TO_UPDATE', () => {
  it('covers the five workspace packages', () => {
    const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')

    expect(FILES_TO_UPDATE.map((file) => file.name)).toEqual([
      'Root workspace',
      'Desktop app',
      'API',
      'Releases service',
      'Landing page',
    ])
    for (const file of FILES_TO_UPDATE) {
      expect(file.path.startsWith(repoRoot)).toBe(true)
      expect(file.replacement('9.9.9')).toBe('"version": "9.9.9"')
      expect(file.pattern.test('{\n  "version": "0.1.0"\n}')).toBe(true)
    }
  })
})

describe('bumpVersion', () => {
  it('rejects invalid versions without touching files', async () => {
    const dir = tempDir()
    const pkg = packageFile(dir, 'pkg', '0.1.0')

    await bumpVersion('not-a-version', [pkg])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalledWith('Invalid version format: not-a-version')
    expect(readFileSync(pkg.path, 'utf8')).toContain('"version": "0.1.0"')
  })

  it('updates every file and prints next steps', async () => {
    const dir = tempDir()
    const files = [packageFile(dir, 'a', '0.1.0'), packageFile(dir, 'b', '0.1.0')]

    await bumpVersion('0.2.0', files)

    for (const file of files) {
      expect(readFileSync(file.path, 'utf8')).toContain('"version": "0.2.0"')
    }
    expect(process.exit).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Updated (2)'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('git tag v0.2.0'))
  })

  it('skips files whose pattern is missing or already current', async () => {
    const dir = tempDir()
    const plainPath = join(dir, 'plain.json')
    writeFileSync(plainPath, '{"name":"plain"}\n')
    const files: FileToUpdate[] = [
      { name: 'plain', path: plainPath, pattern: /"version":\s*"[\d.]+"/, replacement: (v) => `"version": "${v}"` },
      packageFile(dir, 'current', '0.2.0'),
    ]

    await bumpVersion('0.2.0', files)

    expect(process.exit).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Skipped (2)'))
  })

  it('reports failed files and exits', async () => {
    const dir = tempDir()
    const files: FileToUpdate[] = [
      packageFile(dir, 'ok', '0.1.0'),
      {
        name: 'missing',
        path: join(dir, 'does-not-exist.json'),
        pattern: /"version":\s*"[\d.]+"/,
        replacement: (v) => `"version": "${v}"`,
      },
      {
        name: 'exploding',
        path: join(dir, 'exploding.json'),
        pattern: /"version":\s*"[\d.]+"/,
        replacement: () => {
          throw 'string boom'
        },
      },
    ]
    writeFileSync(join(dir, 'exploding.json'), '{"version":"0.1.0"}\n')

    await bumpVersion('0.2.0', files)

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Updated (1)'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Failed (2)'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('string boom'))
  })
})

describe('runBumpVersion', () => {
  it('shows usage without a version', async () => {
    await runBumpVersion(undefined, [])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalledWith('Usage: pnpm run version:bump <version>')
  })

  it('bumps through to the file updater', async () => {
    const dir = tempDir()
    const pkg = packageFile(dir, 'pkg', '0.1.0')

    await runBumpVersion('0.2.0', [pkg])

    expect(process.exit).not.toHaveBeenCalled()
    expect(readFileSync(pkg.path, 'utf8')).toContain('"version": "0.2.0"')
  })
})
