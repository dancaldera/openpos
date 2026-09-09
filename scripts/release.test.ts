import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyEnvFile,
  buildCommands,
  checkVersions,
  collectHashedArtifacts,
  contentTypeFor,
  loadReleaseCredentials,
  parseArgs,
  publishLocal,
  publishRelease,
  readPackageVersion,
  reportFailure,
  requireEnv,
  run,
  runRelease,
  runValidationSteps,
  uploadFile,
  writeManifestFile,
  type CliOptions,
} from './release.js'

const repoRoot = resolve(import.meta.dirname, '..')
const savedEnv = { ...process.env }
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
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, savedEnv)
  vi.restoreAllMocks()
})

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-release-'))
  tempDirs.push(dir)
  return dir
}

describe('parseArgs', () => {
  it('parses every flag', () => {
    const options = parseArgs([
      '--linux',
      '--deb',
      '--mac',
      '--skip-check',
      '--skip-test',
      '--skip-build',
      '--dry-run',
      '--notes',
      'hello',
      '--local-dir',
      'out',
    ])

    expect(options).toEqual({
      platforms: ['linux', 'mac'],
      notes: 'hello',
      skipCheck: true,
      skipTest: true,
      skipBuild: true,
      dryRun: true,
      localDir: 'out',
    })
  })

  it('accepts inline flag values and defaults the rest', () => {
    const options = parseArgs(['--notes=inline notes', '--local-dir=dist-releases'])

    expect(options.notes).toBe('inline notes')
    expect(options.localDir).toBe('dist-releases')
    expect(options.skipCheck).toBe(false)
    expect(options.platforms).toHaveLength(1)
  })

  it('maps missing flag values to null', () => {
    expect(parseArgs(['--notes']).notes).toBeNull()
    expect(parseArgs(['--local-dir']).localDir).toBeNull()
  })

  it('skips holes in sparse argv arrays', () => {
    const options = parseArgs(new Array<string>(2))

    expect(options.skipCheck).toBe(false)
    expect(options.platforms).toHaveLength(1)
  })

  it('exits on unknown options', () => {
    parseArgs(['--bogus'])

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalledWith('Unknown option: --bogus')
  })
})

describe('applyEnvFile', () => {
  it('loads keys without overwriting existing env', () => {
    const dir = tempDir()
    const path = join(dir, '.env')
    writeFileSync(
      path,
      [
        '# comment',
        '',
        '   ',
        'BAREWORD',
        'RELEASE_TEST_BUCKET=from-file',
        "RELEASE_TEST_QUOTED='quoted'",
        'RELEASE_TEST_DOUBLE="quoted"',
        'RELEASE_TEST_LONE="bare',
        "RELEASE_TEST_LONE_SINGLE='bare",
        'RELEASE_TEST_EMPTY=',
      ].join('\n'),
    )

    const env: NodeJS.ProcessEnv = { RELEASE_TEST_BUCKET: 'already-set' }
    applyEnvFile(path, env)

    expect(env).toEqual({
      RELEASE_TEST_BUCKET: 'already-set',
      RELEASE_TEST_QUOTED: 'quoted',
      RELEASE_TEST_DOUBLE: 'quoted',
      RELEASE_TEST_LONE: '"bare',
      RELEASE_TEST_LONE_SINGLE: "'bare",
      RELEASE_TEST_EMPTY: '',
    })
  })

  it('ignores missing files', () => {
    const env: NodeJS.ProcessEnv = {}
    expect(() => applyEnvFile(join(tempDir(), 'does-not-exist.env'), env)).not.toThrow()
    expect(env).toEqual({})
  })

  it('defaults to the process environment', () => {
    const dir = tempDir()
    const path = join(dir, '.env')
    writeFileSync(path, 'RELEASE_TEST_DEFAULT=yes\n')

    applyEnvFile(path)

    expect(process.env.RELEASE_TEST_DEFAULT).toBe('yes')
  })
})

describe('loadReleaseCredentials', () => {
  it('maps Railway bucket names onto upload variables', () => {
    const dir = tempDir()
    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'BUCKET=file-bucket\n')

    const env: NodeJS.ProcessEnv = { AWS_ACCESS_KEY_ID: 'explicit' }
    loadReleaseCredentials(env, envPath)

    expect(env.RELEASE_S3_BUCKET).toBe('file-bucket')
    expect(env.AWS_ACCESS_KEY_ID).toBe('explicit')
    expect(env.RELEASE_S3_REGION).toBeUndefined()
  })

  it('preserves already-set upload variables', () => {
    const dir = tempDir()
    const envPath = join(dir, '.env')
    writeFileSync(envPath, '')

    const env: NodeJS.ProcessEnv = { RELEASE_S3_BUCKET: 'keep', BUCKET: 'ignored' }
    loadReleaseCredentials(env, envPath)

    expect(env.RELEASE_S3_BUCKET).toBe('keep')
  })

  it('defaults to the process environment and the service env file', () => {
    expect(() => loadReleaseCredentials()).not.toThrow()
  })
})

describe('readPackageVersion', () => {
  it('reads the version from a workspace package file', async () => {
    await expect(readPackageVersion('package.json')).resolves.toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('run', () => {
  it('runs commands silently on success', () => {
    expect(() => run('node', ['-e', ''])).not.toThrow()
  })

  it('throws with the exit code on failure', () => {
    expect(() => run('node', ['-e', 'process.exit(3)'])).toThrow('node -e process.exit(3) failed with exit code 3')
  })

  it('merges custom env over the process environment', () => {
    expect(() => run('node', ['-e', 'process.exit(process.env.RELEASE_TEST_FLAG === "1" ? 0 : 2)'], {
      RELEASE_TEST_FLAG: '1',
    })).not.toThrow()

    expect(() => run('node', ['-e', 'process.exit(process.env.RELEASE_TEST_FLAG === "1" ? 0 : 2)'])).toThrow(
      'failed with exit code 2',
    )
  })
})

describe('buildCommands', () => {
  it('builds one command per platform', () => {
    const commands = buildCommands(['mac', 'linux'])

    expect(commands).toHaveLength(2)
    for (const { command, args } of commands) {
      expect(command).toEqual(expect.any(String))
      expect(args.length).toBeGreaterThan(0)
    }
    expect(buildCommands([])).toEqual([])
  })
})

describe('requireEnv', () => {
  it('returns set variables and throws for missing ones', () => {
    expect(requireEnv('RELEASE_TEST_KEY', { RELEASE_TEST_KEY: 'value' })).toBe('value')
    expect(() => requireEnv('RELEASE_TEST_MISSING', {})).toThrow('Missing required environment variable: RELEASE_TEST_MISSING')
  })

  it('defaults to the process environment', () => {
    process.env.RELEASE_TEST_KEY = 'value'
    expect(requireEnv('RELEASE_TEST_KEY')).toBe('value')
  })
})

describe('contentTypeFor', () => {
  it('maps artifact extensions to content types', () => {
    expect(contentTypeFor('releases/latest.json')).toBe('application/json')
    expect(contentTypeFor('releases/v1.0.0/app.deb')).toBe('application/vnd.debian.binary-package')
    expect(contentTypeFor('releases/v1.0.0/app.zip')).toBe('application/zip')
    expect(contentTypeFor('releases/v1.0.0/app.AppImage')).toBe('application/x-executable')
    expect(contentTypeFor('releases/v1.0.0/app.dmg')).toBe('application/x-apple-diskimage')
    expect(contentTypeFor('releases/v1.0.0/app.bin')).toBe('application/octet-stream')
  })
})

describe('uploadFile', () => {
  it('sends artifacts with bucket, key, stream, and content type', async () => {
    // Stream a persistent file: the lazy read stream outlives tmpdir cleanup.
    const filePath = import.meta.filename as string
    const sent: unknown[] = []
    const client = { send: async (command: unknown) => void sent.push(command) }

    await uploadFile(client, 'bucket', 'releases/v1.0.0/app.zip', filePath)

    expect(sent).toHaveLength(1)
    const input = (sent[0] as { input: Record<string, unknown> }).input
    expect(input.Bucket).toBe('bucket')
    expect(input.Key).toBe('releases/v1.0.0/app.zip')
    expect(input.ContentType).toBe('application/zip')
    expect((input.Body as { path: string }).path).toBe(filePath)
  })
})

describe('publishLocal', () => {
  it('copies artifacts and the manifest into the local layout', async () => {
    const dir = tempDir()
    const artifactPath = join(dir, 'app.zip')
    writeFileSync(artifactPath, 'fake-zip-bytes')
    const manifestPath = join(dir, 'latest.json')
    writeFileSync(manifestPath, '{"version":"1.0.0"}')
    const outDir = join(dir, 'out')

    await publishLocal(outDir, 'releases', '1.0.0', [{ name: 'app.zip', filePath: artifactPath }], manifestPath)

    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(outDir, 'releases/v1.0.0/app.zip'), 'utf8')).toBe('fake-zip-bytes')
    expect(readFileSync(join(outDir, 'releases/latest.json'), 'utf8')).toBe('{"version":"1.0.0"}')
  })
})

describe('checkVersions', () => {
  it('returns the expected version when every package matches', async () => {
    await expect(checkVersions(async () => '1.0.0')).resolves.toBe('1.0.0')
  })

  it('throws a detailed error on mismatch', async () => {
    const readVersion = async (path: string) => (path === 'apps/api/package.json' ? '0.9.0' : '1.0.0')

    await expect(checkVersions(readVersion)).rejects.toThrow('Version mismatch against apps/desktop (1.0.0)')
    await expect(checkVersions(readVersion)).rejects.toThrow('API')
    await expect(checkVersions(readVersion)).rejects.toThrow('pnpm run version:bump')
  })

  it('reads the real workspace files by default', async () => {
    const expected = await readPackageVersion('package.json')

    await expect(checkVersions()).resolves.toBe(expected)
  })
})

describe('runValidationSteps', () => {
  const options = (overrides: Partial<CliOptions> = {}): CliOptions => ({
    platforms: ['mac'],
    notes: null,
    skipCheck: false,
    skipTest: false,
    skipBuild: false,
    dryRun: false,
    localDir: null,
    ...overrides,
  })

  it('runs check, tests, and one build per platform', () => {
    const calls: string[] = []
    runValidationSteps(options({ platforms: ['mac', 'linux'] }), (command, args) => {
      calls.push(`${command} ${args.join(' ')}`)
    })

    expect(calls[0]).toBe('pnpm run check')
    expect(calls[1]).toBe('pnpm run test')
    expect(calls.length).toBe(4)
  })

  it('skips everything when all skip flags are set', () => {
    const runCommand = vi.fn()
    runValidationSteps(options({ skipCheck: true, skipTest: true, skipBuild: true }), runCommand)

    expect(runCommand).not.toHaveBeenCalled()
  })
})

describe('collectHashedArtifacts', () => {
  it('hashes every artifact for the selected platforms', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'openpos-x86_64.AppImage'), 'appimage-bytes')
    writeFileSync(join(dir, 'openpos_amd64.deb'), 'deb-bytes')
    writeFileSync(join(dir, 'notes.txt'), 'not an artifact')

    const hashed = await collectHashedArtifacts(dir, ['linux'])

    expect(hashed.map((artifact) => artifact.name).sort()).toEqual(['openpos-x86_64.AppImage', 'openpos_amd64.deb'])
    const appImage = hashed.find((artifact) => artifact.name === 'openpos-x86_64.AppImage')
    expect(appImage).toMatchObject({
      sha256: createHash('sha256').update('appimage-bytes').digest('hex'),
      size: 'appimage-bytes'.length,
    })
  })

  it('throws a detailed error when artifacts are missing', async () => {
    await expect(collectHashedArtifacts(tempDir(), ['mac'])).rejects.toThrow('Missing artifacts')
  })
})

describe('writeManifestFile', () => {
  it('writes the manifest with versioned assets', async () => {
    const dir = tempDir()

    const manifestPath = await writeManifestFile(dir, {
      version: '1.0.0',
      notes: 'hello',
      cdnBaseUrl: 'https://releases.openpos.xyz/',
      prefix: 'releases',
      artifacts: [{ name: 'app.zip', filePath: join(dir, 'app.zip'), sha256: 'abc', size: 3 }],
    })

    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(manifestPath).toBe(join(dir, 'latest.json'))
    expect(manifest.version).toBe('1.0.0')
    expect(manifest.notes).toBe('hello')
    expect(manifest.assets).toHaveLength(1)
    expect(manifest.assets[0].url).toBe('https://releases.openpos.xyz/v/1.0.0/app.zip')
  })
})

describe('publishRelease', () => {
  const artifact = (dir: string) => {
    const filePath = join(dir, 'app.zip')
    writeFileSync(filePath, 'fake-zip-bytes')
    return { name: 'app.zip', filePath, sha256: 'abc', size: 14 }
  }

  it('publishes to a local dir without bucket credentials', async () => {
    const dir = tempDir()
    const outDir = join(dir, 'out')
    const manifestPath = join(dir, 'latest.json')
    writeFileSync(manifestPath, '{"version":"1.0.0"}')

    await publishRelease(
      {
        artifacts: [artifact(dir)],
        manifestPath,
        version: '1.0.0',
        localDir: relative(repoRoot, outDir),
        cdnBaseUrl: 'https://releases.openpos.xyz',
        prefix: 'releases',
      },
      { env: {} },
    )

    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(outDir, 'releases/v1.0.0/app.zip'), 'utf8')).toBe('fake-zip-bytes')
    expect(readFileSync(join(outDir, 'releases/latest.json'), 'utf8')).toBe('{"version":"1.0.0"}')
  })

  it('uploads artifacts and the manifest to the bucket', async () => {
    const dir = tempDir()
    const manifestPath = join(dir, 'latest.json')
    writeFileSync(manifestPath, '{}')
    const configs: unknown[] = []
    const uploads: unknown[] = []
    const fakeClient = { send: async (command: unknown) => void uploads.push(command) }

    await publishRelease(
      {
        artifacts: [artifact(dir)],
        manifestPath,
        version: '1.0.0',
        localDir: null,
        cdnBaseUrl: 'https://releases.openpos.xyz',
        prefix: 'releases',
      },
      {
        env: { RELEASE_S3_BUCKET: 'bucket', AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's' },
        createClient: async (config) => {
          configs.push(config)
          return fakeClient
        },
        upload: async (_client, bucket, key, filePath) => void uploads.push({ bucket, key, filePath }),
      },
    )

    expect(configs).toEqual([{ region: 'auto' }])
    expect(uploads).toEqual([
      { bucket: 'bucket', key: 'releases/v1.0.0/app.zip', filePath: join(dir, 'app.zip') },
      { bucket: 'bucket', key: 'releases/latest.json', filePath: manifestPath },
    ])
  })

  it('honors endpoint, region, and path-style settings', async () => {
    const dir = tempDir()
    const configs: unknown[] = []
    const fakeClient = { send: async () => {} }

    await publishRelease(
      {
        artifacts: [],
        manifestPath: join(dir, 'latest.json'),
        version: '1.0.0',
        localDir: null,
        cdnBaseUrl: 'https://releases.openpos.xyz',
        prefix: 'releases',
      },
      {
        env: {
          RELEASE_S3_BUCKET: 'bucket',
          AWS_ACCESS_KEY_ID: 'k',
          AWS_SECRET_ACCESS_KEY: 's',
          RELEASE_S3_REGION: 'us-east-1',
          RELEASE_S3_ENDPOINT: 'https://s3.example.com',
          RELEASE_S3_PATH_STYLE: '1',
        },
        createClient: async (config) => {
          configs.push(config)
          return fakeClient
        },
        upload: async () => {},
      },
    )

    expect(configs).toEqual([{ region: 'us-east-1', endpoint: 'https://s3.example.com', forcePathStyle: true }])
  })

  it('uses the real upload implementation by default', async () => {
    // Stream a persistent file: the lazy read streams outlive tmpdir cleanup.
    const filePath = import.meta.filename as string
    const sent: unknown[] = []
    const fakeClient = { send: async (command: unknown) => void sent.push(command) }

    await publishRelease(
      {
        artifacts: [{ name: 'app.zip', filePath, sha256: 'abc', size: 14 }],
        manifestPath: filePath,
        version: '1.0.0',
        localDir: null,
        cdnBaseUrl: 'https://releases.openpos.xyz',
        prefix: 'releases',
      },
      {
        env: { RELEASE_S3_BUCKET: 'bucket', AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's' },
        createClient: async () => fakeClient,
      },
    )

    expect(sent).toHaveLength(2)
    expect((sent[0] as { input: Record<string, unknown> }).input.Key).toBe('releases/v1.0.0/app.zip')
    expect((sent[1] as { input: Record<string, unknown> }).input.Key).toBe('releases/latest.json')
  })

  it('throws when there is nowhere to publish', async () => {
    await expect(
      publishRelease(
        { artifacts: [], manifestPath: 'latest.json', version: '1.0.0', localDir: null, cdnBaseUrl: 'https://x', prefix: 'r' },
        { env: {} },
      ),
    ).rejects.toThrow('Missing RELEASE_S3_BUCKET')
  })

  it('requires AWS credentials for bucket uploads', async () => {
    await expect(
      publishRelease(
        { artifacts: [], manifestPath: 'latest.json', version: '1.0.0', localDir: null, cdnBaseUrl: 'https://x', prefix: 'r' },
        { env: { RELEASE_S3_BUCKET: 'bucket' }, createClient: async () => ({ send: async () => {} }) },
      ),
    ).rejects.toThrow('Missing required environment variable: AWS_ACCESS_KEY_ID')
  })

  it('requires an S3 client factory for bucket uploads', async () => {
    await expect(
      publishRelease(
        { artifacts: [], manifestPath: 'latest.json', version: '1.0.0', localDir: null, cdnBaseUrl: 'https://x', prefix: 'r' },
        { env: { RELEASE_S3_BUCKET: 'bucket', AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's' } },
      ),
    ).rejects.toThrow('Missing S3 client factory')
  })

  it('defaults to the process environment', async () => {
    delete process.env.RELEASE_S3_BUCKET

    await expect(
      publishRelease(
        { artifacts: [], manifestPath: 'latest.json', version: '1.0.0', localDir: null, cdnBaseUrl: 'https://x', prefix: 'r' },
        {},
      ),
    ).rejects.toThrow('Missing RELEASE_S3_BUCKET')

    delete process.env.RELEASE_S3_BUCKET
    await expect(
      publishRelease({ artifacts: [], manifestPath: 'latest.json', version: '1.0.0', localDir: null, cdnBaseUrl: 'https://x', prefix: 'r' }),
    ).rejects.toThrow('Missing RELEASE_S3_BUCKET')
  })
})

describe('runRelease', () => {
  const steps = (calls: string[]) => ({
    loadCredentials: () => void calls.push('credentials'),
    checkVersions: async () => {
      calls.push('check')
      return '1.0.0'
    },
    runValidation: async () => void calls.push('validate'),
    collectHashed: async () => {
      calls.push('collect')
      return []
    },
    writeManifest: async () => {
      calls.push('manifest')
      return '/tmp/latest.json'
    },
    publish: async () => void calls.push('publish'),
  })

  it('runs every step in order', async () => {
    const calls: string[] = []

    await runRelease(['--mac'], steps(calls))

    expect(calls).toEqual(['credentials', 'check', 'validate', 'collect', 'manifest', 'publish'])
  })

  it('stops before publishing on dry runs', async () => {
    const calls: string[] = []

    await runRelease(['--dry-run'], steps(calls))

    expect(calls).toEqual(['credentials', 'check', 'validate', 'collect', 'manifest'])
  })
})

describe('reportFailure', () => {
  it('reports errors and exits', () => {
    reportFailure(new Error('kaboom'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('kaboom'))
    expect(process.exit).toHaveBeenCalledWith(1)

    reportFailure('string boom')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('string boom'))
    expect(process.exit).toHaveBeenCalledTimes(2)
  })
})
