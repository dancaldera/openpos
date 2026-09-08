import { describe, expect, it, vi } from 'vitest'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
const {
  assertUpdateFilePath,
  buildDebInstallCommand,
  buildDebInstallCommands,
  buildDebRestartCommand,
  isDebianLikeOsRelease,
  isLinuxDebInstall,
  privilegedSpawnEnv,
  resolveLinuxUpdateFormat,
  resolveMacAppBundlePath,
  resolveUpdateDownloadFileName,
  resolveUpdateFormat,
} = await import('./update-installer.cjs')

const { registerSingleInstance } = await import('./app-lifecycle.cjs')

describe('update installer helpers', () => {
  it('waits for the old process to exit before restarting the installed Debian app', () => {
    expect(buildDebRestartCommand({
      currentPid: 4321,
      exePath: '/usr/bin/openpos',
      args: ['--fullscreen'],
    })).toEqual({
      command: '/bin/sh',
      args: [
        '-c',
        'old_pid=$1\nshift\nwhile kill -0 "$old_pid" 2>/dev/null; do sleep 0.1; done\nfor pid in $(pgrep -f "$1.*--type=" 2>/dev/null); do kill "$pid" 2>/dev/null; done\nsleep 2.5\nexec "$@"',
        'openpos-restart',
        '4321',
        '/usr/bin/openpos',
        '--fullscreen',
      ],
    })
  })

  it('does not execute the Debian replacement while the old process is alive', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'openpos-deb-restart-'))
    const markerPath = path.join(tempDir, 'started')
    const blocker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    await new Promise((resolve) => blocker.once('spawn', resolve))

    let replacement
    try {
      const restart = buildDebRestartCommand({
        currentPid: blocker.pid,
        exePath: process.execPath,
        args: ['-e', 'require("node:fs").writeFileSync(process.argv[1], "started")', markerPath],
      })
      replacement = spawn(restart.command, restart.args, { stdio: 'ignore' })

      await new Promise((resolve) => setTimeout(resolve, 50))
      await expect(access(markerPath)).rejects.toThrow()
      blocker.kill()
      await new Promise((resolve, reject) => {
        replacement.once('error', reject)
        replacement.once('close', (code) => code === 0 ? resolve() : reject(new Error(`replacement exited ${code}`)))
      })

      expect(await readFile(markerPath, 'utf8')).toBe('started')
    } finally {
      blocker.kill()
      replacement?.kill()
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects a second app process and focuses the existing window', () => {
    const listeners = {}
    const existingWindow = {
      focus: vi.fn(),
      isDestroyed: () => false,
      isMinimized: () => true,
      isVisible: () => true,
      restore: vi.fn(),
    }
    const app = {
      on: (event, handler) => {
        listeners[event] = handler
      },
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
    }

    expect(registerSingleInstance(app, () => existingWindow)).toBe(true)
    listeners['second-instance']()

    expect(existingWindow.restore).toHaveBeenCalledOnce()
    expect(existingWindow.focus).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()

    existingWindow.isVisible = () => false
    listeners['second-instance']()
    expect(existingWindow.focus).toHaveBeenCalledOnce()

    app.requestSingleInstanceLock.mockReturnValue(false)
    expect(registerSingleInstance(app, () => existingWindow)).toBe(false)
    expect(app.quit).toHaveBeenCalledOnce()
  })

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
      isPackaged: true,
      exePath: '/opt/OpenPOS/openpos',
      readFileSync: () => 'ID=fedora\nID_LIKE="rhel fedora"\n',
    })

    expect(format).toBeNull()
  })

  it('returns deb for packaged Debian installs under /opt', () => {
    const format = resolveLinuxUpdateFormat({
      platform: 'linux',
      env: {},
      isPackaged: true,
      exePath: '/opt/OpenPOS/openpos',
      readFileSync: () => 'ID=ubuntu\nID_LIKE="debian"\n',
    })

    expect(format).toBe('deb')
  })

  it('returns null for unpackaged Debian development builds', () => {
    const format = resolveLinuxUpdateFormat({
      platform: 'linux',
      env: {},
      isPackaged: false,
      exePath: '/home/openpos/Documentos/openpos/node_modules/electron/dist/electron',
      readFileSync: () => 'ID=ubuntu\nID_LIKE="debian"\n',
    })

    expect(format).toBeNull()
  })

  it('returns null for packaged Linux builds that are not installed via dpkg', () => {
    const format = resolveLinuxUpdateFormat({
      platform: 'linux',
      env: {},
      isPackaged: true,
      exePath: '/home/openpos/Documentos/openpos/apps/desktop/dist-electron/linux-unpacked/openpos',
      readFileSync: () => 'ID=ubuntu\nID_LIKE="debian"\n',
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
      command: '/usr/bin/pkexec',
      args: [
        '/usr/bin/env',
        'DEBIAN_FRONTEND=noninteractive',
        '/usr/bin/apt-get',
        '-o',
        'Dpkg::Options::=--force-confdef',
        '-o',
        'Dpkg::Options::=--force-confold',
        'install',
        '-y',
        '--allow-downgrades',
        '/tmp/openpos.deb',
      ],
      env: {
        PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
        DEBIAN_FRONTEND: 'noninteractive',
      },
    })
  })

  it('builds a direct apt-get Debian install command for root', () => {
    expect(buildDebInstallCommand({ debPath: '/tmp/openpos.deb', isRoot: true })).toEqual({
      command: '/usr/bin/apt-get',
      args: [
        '-o',
        'Dpkg::Options::=--force-confdef',
        '-o',
        'Dpkg::Options::=--force-confold',
        'install',
        '-y',
        '--allow-downgrades',
        '/tmp/openpos.deb',
      ],
      env: {
        PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
        DEBIAN_FRONTEND: 'noninteractive',
      },
    })
  })

  it('prefers PackageKit before pkexec so updates work under NO_NEW_PRIVS', () => {
    const commands = buildDebInstallCommands({
      debPath: '/tmp/openpos.deb',
      isRoot: false,
      availableCommands: { pkcon: true, pkexec: true },
      processEnv: { DISPLAY: ':1', LD_LIBRARY_PATH: '/opt/OpenPOS' },
    })

    expect(commands.map((item) => item.command)).toEqual(['/usr/bin/pkcon', '/usr/bin/pkexec'])
    expect(commands[0].args).toEqual(['install-local', '--allow-untrusted', '/tmp/openpos.deb'])
    expect(commands[0].env.DISPLAY).toBe(':1')
  })

  it('drops Electron library paths from the privileged spawn environment', () => {
    expect(
      privilegedSpawnEnv({
        LD_LIBRARY_PATH: '/opt/OpenPOS',
        DISPLAY: ':0',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      }),
    ).toEqual({
      PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
      DEBIAN_FRONTEND: 'noninteractive',
      DISPLAY: ':0',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    })
  })

  it('detects dpkg install locations under /opt and /usr', () => {
    expect(isLinuxDebInstall('/opt/OpenPOS/openpos')).toBe(true)
    expect(isLinuxDebInstall('/usr/bin/openpos')).toBe(true)
    expect(isLinuxDebInstall('/home/openpos/apps/desktop/dist-electron/linux-unpacked/openpos')).toBe(false)
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

  it('returns deb for packaged Ubuntu installs under /opt', () => {
    const format = resolveUpdateFormat({
      platform: 'linux',
      env: {},
      isPackaged: true,
      exePath: '/opt/OpenPOS/openpos',
      readFileSync: () => 'ID=ubuntu\nID_LIKE="debian"\n',
    })

    expect(format).toBe('deb')
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
