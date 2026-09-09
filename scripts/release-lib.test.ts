import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assetKey,
  assetUrl,
  buildCommandForPlatform,
  buildManifest,
  collectArtifacts,
  filterArtifactsForPlatforms,
  findMissingArtifacts,
  manifestKey,
  manifestUrl,
  resolveReleasePlatforms,
  sha256File,
  validatePackageVersions,
} from './release-lib'

describe('resolveReleasePlatforms', () => {
  it('defaults to mac on darwin and linux elsewhere', () => {
    expect(resolveReleasePlatforms([], 'darwin')).toEqual(['mac'])
    expect(resolveReleasePlatforms([], 'linux')).toEqual(['linux'])
  })

  it('accumulates explicit flags and drops deb when linux is also selected', () => {
    expect(resolveReleasePlatforms(['mac', 'linux'], 'darwin')).toEqual(['mac', 'linux'])
    expect(resolveReleasePlatforms(['linux', 'deb'], 'darwin')).toEqual(['linux'])
    expect(resolveReleasePlatforms(['deb'], 'darwin')).toEqual(['deb'])
  })

  it('deduplicates repeated flags', () => {
    expect(resolveReleasePlatforms(['mac', 'mac', 'linux', 'linux'], 'darwin')).toEqual(['mac', 'linux'])
  })
})

describe('buildCommandForPlatform', () => {
  it('builds macOS on the host', () => {
    expect(buildCommandForPlatform('mac', 'darwin')).toEqual({
      command: 'pnpm',
      args: ['-C', 'apps/desktop', 'run', 'build:desktop:mac'],
    })
  })

  it('uses a Linux container from macOS', () => {
    expect(buildCommandForPlatform('linux', 'darwin')).toEqual({
      command: 'bash',
      args: ['scripts/build-linux-in-container.sh', '--target=linux'],
    })
    expect(buildCommandForPlatform('deb', 'darwin')).toEqual({
      command: 'bash',
      args: ['scripts/build-linux-in-container.sh', '--target=deb'],
    })
  })

  it('builds Linux natively on a Linux host', () => {
    expect(buildCommandForPlatform('linux', 'linux')).toEqual({
      command: 'pnpm',
      args: ['-C', 'apps/desktop', 'run', 'build:desktop:linux'],
    })
    expect(buildCommandForPlatform('deb', 'linux')).toEqual({
      command: 'pnpm',
      args: ['-C', 'apps/desktop', 'run', 'build:desktop:linux:deb'],
    })
  })
})

describe('validatePackageVersions', () => {
  it('returns no errors when every package matches the expected version', () => {
    const errors = validatePackageVersions('1.2.3', {
      'Root workspace': '1.2.3',
      'Desktop app': '1.2.3',
      API: '1.2.3',
      'Landing page': '1.2.3',
    })

    expect(errors).toEqual([])
  })

  it('reports each package that does not match the expected version', () => {
    const errors = validatePackageVersions('1.2.3', {
      'Root workspace': '1.2.3',
      'Desktop app': '1.2.4',
    })

    expect(errors).toEqual(['Desktop app version 1.2.4 does not match 1.2.3'])
  })
})

describe('collectArtifacts and findMissingArtifacts', () => {
  it('finds only release artifacts in the dist directory', async () => {
    const distDir = await mkdtemp(join(tmpdir(), 'openpos-release-'))
    await writeFile(join(distDir, 'openpos-x86_64.AppImage'), 'appimage')
    await writeFile(join(distDir, 'openpos_amd64.deb'), 'deb')
    await writeFile(join(distDir, 'openpos-arm64.zip'), 'zip')
    await writeFile(join(distDir, 'openpos-arm64.zip.blockmap'), 'blockmap')
    await writeFile(join(distDir, 'builder-debug.yml'), 'debug')
    await writeFile(join(distDir, 'latest.yml'), 'latest')

    const artifacts = await collectArtifacts(distDir)
    const names = artifacts.map((artifact) => artifact.name)

    expect(names).toEqual(['openpos-arm64.zip', 'openpos-x86_64.AppImage', 'openpos_amd64.deb'])
  })

  it('reports missing artifacts per platform family', () => {
    const artifacts = [{ filePath: '/tmp/openpos-x86_64.AppImage', name: 'openpos-x86_64.AppImage' }]

    const missing = findMissingArtifacts(artifacts, ['linux', 'mac'])

    expect(missing).toEqual(['a *.deb artifact for linux', 'a *.zip artifact for mac', 'a *.dmg artifact for mac'])
  })

  it('returns nothing missing when all required artifacts exist', () => {
    const missing = findMissingArtifacts(
      [
        { filePath: '/tmp/openpos-x86_64.AppImage', name: 'openpos-x86_64.AppImage' },
        { filePath: '/tmp/openpos_amd64.deb', name: 'openpos_amd64.deb' },
        { filePath: '/tmp/openpos-arm64.zip', name: 'openpos-arm64.zip' },
      ],
      ['linux'],
    )

    expect(missing).toEqual([])
  })

  it('requires only a .deb when publishing the Debian target', () => {
    const artifacts = [
      { filePath: '/tmp/openpos_amd64.deb', name: 'openpos_amd64.deb' },
      { filePath: '/tmp/openpos-x86_64.AppImage', name: 'openpos-x86_64.AppImage' },
    ]

    expect(findMissingArtifacts(artifacts, ['deb'])).toEqual([])
    expect(filterArtifactsForPlatforms(artifacts, ['deb']).map((artifact) => artifact.name)).toEqual([
      'openpos_amd64.deb',
    ])
  })
})

describe('sha256File', () => {
  it('computes the sha256 digest of a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openpos-sha-'))
    const filePath = join(dir, 'sample.txt')
    await writeFile(filePath, 'hello openpos')

    expect(await sha256File(filePath)).toBe('fe0f20c6856d612b28548095e71ecfa67868be7244caf732ecfb44bc58315c54')
  })
})

describe('bucket keys and urls', () => {
  it('builds versioned asset keys under the prefix', () => {
    expect(assetKey('releases', '1.2.3', 'openpos-x86_64.AppImage')).toBe('releases/v1.2.3/openpos-x86_64.AppImage')
  })

  it('normalizes leading and trailing slashes on the prefix', () => {
    expect(assetKey('/releases/', '1.2.3', 'openpos_amd64.deb')).toBe('releases/v1.2.3/openpos_amd64.deb')
    expect(manifestKey('releases')).toBe('releases/latest.json')
  })

  it('joins the cdn base url with keys without double slashes', () => {
    expect(assetUrl('https://releases.openpos.xyz/', 'releases', '1.2.3', 'openpos-arm64.zip')).toBe(
      'https://releases.openpos.xyz/v/1.2.3/openpos-arm64.zip',
    )
    expect(manifestUrl('https://releases.openpos.xyz', 'releases')).toBe(
      'https://releases.openpos.xyz/releases/latest.json',
    )
  })
})

describe('buildManifest', () => {
  it('builds a manifest with versioned asset urls and checksums', () => {
    const manifest = buildManifest({
      version: '1.2.3',
      notes: 'Fixes printing',
      publishedAt: new Date('2025-08-22T12:00:00Z'),
      cdnBaseUrl: 'https://releases.openpos.xyz',
      prefix: 'releases',
      artifacts: [
        { name: 'openpos-x86_64.AppImage', sha256: 'abc123', size: 1024 },
        { name: 'openpos_amd64.deb', sha256: 'def456', size: 2048 },
      ],
    })

    expect(manifest).toEqual({
      format: 'openpos-release-manifest',
      version: '1.2.3',
      notes: 'Fixes printing',
      publishedAt: '2025-08-22T12:00:00.000Z',
      assets: [
        {
          name: 'openpos-x86_64.AppImage',
          url: 'https://releases.openpos.xyz/v/1.2.3/openpos-x86_64.AppImage',
          sha256: 'abc123',
          size: 1024,
        },
        {
          name: 'openpos_amd64.deb',
          url: 'https://releases.openpos.xyz/v/1.2.3/openpos_amd64.deb',
          sha256: 'def456',
          size: 2048,
        },
      ],
    })
  })
})
