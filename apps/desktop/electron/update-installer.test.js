const { describe, expect, it } = require('bun:test')
const path = require('node:path')
const {
  assertUpdateFilePath,
  buildDebInstallCommand,
  isDebianLikeOsRelease,
  resolveLinuxUpdateFormat,
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
})
