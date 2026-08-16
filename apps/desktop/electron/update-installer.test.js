const { describe, expect, it } = require('bun:test')
const path = require('node:path')
const {
  assertUpdateFilePath,
  buildDebInstallCommand,
  isDebianLikeOsRelease,
  resolveLinuxUpdateFormat,
  resolveMacAppBundlePath,
  resolveUpdateDownloadFileName,
  resolveUpdateFormat,
} = require('./update-installer.cjs')

describe('update installer helpers', () => {
  it('detects Debian from ID=debian', () => {
    expect(isDebianLikeOsRelease('NAME="Debian GNU/Linux"\nID=debian\n')).toBe(true)
  })

  it('detects Debian through ID_LIKE=debian', () => {
    expect(isDebianLikeOsRelease('ID=ubuntu\nID_LIKE="debian"\n')).toBe(true)
  })

  it('returns no Debian update format for non-Debian Linux', () => {
    const format = resolveLinuxUpdateFormat({
      platform: 'linux',
      env: {},
      readFileSync: () => 'ID=fedora\nID_LIKE="rhel fedora"\n',
    })

    expect(format).toBeNull()
  })

  it('prefers the AppImage update format when APPIMAGE is set', () => {
    const format = resolveLinuxUpdateFormat({
      platform: 'linux',
      env: { APPIMAGE: '/tmp/OpenPOS.AppImage' },
      readFileSync: () => 'ID=debian\n',
    })

    expect(format).toBe('appimage')
  })

  it('builds a pkexec Debian install command for non-root users', () => {
    expect(buildDebInstallCommand({ debPath: '/tmp/openpos.deb', isRoot: false })).toEqual({
      command: 'pkexec',
      args: ['apt-get', 'install', '-y', '/tmp/openpos.deb'],
    })
  })

  it('builds a direct apt-get Debian install command for root', () => {
    expect(buildDebInstallCommand({ debPath: '/tmp/openpos.deb', isRoot: true })).toEqual({
      command: 'apt-get',
      args: ['install', '-y', '/tmp/openpos.deb'],
    })
  })

  it('rejects update paths outside the temp directory', () => {
    expect(() =>
      assertUpdateFilePath({
        tempDir: '/tmp/openpos-updates',
        filePath: '/tmp/openpos.deb',
        format: 'deb',
      }),
    ).toThrow('unexpected location')
  })

  it('rejects non-deb paths for Debian installs', () => {
    expect(() =>
      assertUpdateFilePath({
        tempDir: '/tmp/openpos-updates',
        filePath: path.join('/tmp/openpos-updates', 'openpos.AppImage'),
        format: 'deb',
      }),
    ).toThrow('.deb')
  })

  it('accepts zip paths for mac-zip installs', () => {
    const filePath = path.join('/tmp/openpos-updates', 'openpos-arm64.zip')
    expect(
      assertUpdateFilePath({
        tempDir: '/tmp/openpos-updates',
        filePath,
        format: 'mac-zip',
      }),
    ).toBe(filePath)
  })

  it('rejects non-zip paths for mac-zip installs', () => {
    expect(() =>
      assertUpdateFilePath({
        tempDir: '/tmp/openpos-updates',
        filePath: path.join('/tmp/openpos-updates', 'openpos-arm64.dmg'),
        format: 'mac-zip',
      }),
    ).toThrow('.zip')
  })
})

describe('resolveMacAppBundlePath', () => {
  it('resolves the .app bundle from the executable path', () => {
    expect(resolveMacAppBundlePath('/Applications/OpenPOS.app/Contents/MacOS/OpenPOS')).toBe(
      '/Applications/OpenPOS.app',
    )
  })

  it('returns null for executables outside an .app bundle', () => {
    expect(resolveMacAppBundlePath('/usr/local/bin/openpos')).toBeNull()
    expect(resolveMacAppBundlePath('')).toBeNull()
  })
})

describe('resolveUpdateFormat', () => {
  it('delegates to the Linux format resolution on linux', () => {
    const format = resolveUpdateFormat({
      platform: 'linux',
      env: { APPIMAGE: '/tmp/OpenPOS.AppImage' },
      readFileSync: () => 'ID=debian\n',
    })

    expect(format).toBe('appimage')
  })

  it('returns mac-zip for packaged macOS app bundles', () => {
    const format = resolveUpdateFormat({
      platform: 'darwin',
      isPackaged: true,
      exePath: '/Applications/OpenPOS.app/Contents/MacOS/OpenPOS',
    })

    expect(format).toBe('mac-zip')
  })

  it('returns null for unpackaged macOS builds', () => {
    const format = resolveUpdateFormat({
      platform: 'darwin',
      isPackaged: false,
      exePath: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    })

    expect(format).toBeNull()
  })

  it('returns null for unsupported platforms', () => {
    expect(resolveUpdateFormat({ platform: 'win32' })).toBeNull()
  })
})

describe('resolveUpdateDownloadFileName', () => {
  it('keeps the asset file name for mac-zip downloads', () => {
    const fileName = resolveUpdateDownloadFileName(
      'https://github.com/dancaldera/openpos/releases/download/v0.9.0/openpos-arm64.zip',
      '0.9.0',
      'arm64',
      'mac-zip',
    )

    expect(fileName).toBe('openpos-arm64.zip')
  })

  it('falls back to a generated zip name for mac-zip downloads', () => {
    const fileName = resolveUpdateDownloadFileName(
      'https://example.com/download/latest',
      '0.9.0',
      'arm64',
      'mac-zip',
    )

    expect(fileName).toBe('openpos-0.9.0-arm64.zip')
  })

  it('rejects unsupported update formats', () => {
    expect(() =>
      resolveUpdateDownloadFileName('https://example.com/file.exe', '0.9.0', 'x64', 'exe'),
    ).toThrow('Unsupported update format')
  })
})
