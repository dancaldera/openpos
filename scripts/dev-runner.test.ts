import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Server } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopModeDependencies, DesktopModeRuntime } from './dev-runner-lib'
import {
  canConnectToPort,
  delay,
  ensureElectronBinaryInstalled,
  getWorkspacePackagePath,
  installSignalHandlers,
  isDevMode,
  main,
  registerChild,
  resolveWorkspaceBinary,
  runCommand,
  runSingleProcessMode,
  shutdown,
  spawnLongRunning,
  terminateChildren,
  waitForChildExit,
  waitForPort,
} from './dev-runner'

const tempDirs: string[] = []

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation(((() => {}) as unknown) as never)
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-dev-runner-'))
  tempDirs.push(dir)
  return dir
}

function fakeChild() {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  return {
    killed: false,
    kill: vi.fn(function (this: { killed: boolean }) {
      this.killed = true
      return true
    }),
    once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      handlers[event] = callback
    }),
    emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  }
}

describe('delay', () => {
  it('resolves after the timeout', async () => {
    await expect(delay(5)).resolves.toBeUndefined()
  })
})

describe('isDevMode', () => {
  it('validates dev mode names', () => {
    expect(isDevMode(undefined)).toBe(false)
    expect(isDevMode('bogus')).toBe(false)
    for (const mode of ['dev', 'dev:desktop', 'dev:desktop:web', 'dev:api', 'dev:landing']) {
      expect(isDevMode(mode)).toBe(true)
    }
  })
})

describe('waitForChildExit', () => {
  it('maps signals and codes to exit codes', async () => {
    const viaSignal = fakeChild()
    const sigint = waitForChildExit(viaSignal as never)
    viaSignal.emit('exit', null, 'SIGINT')
    await expect(sigint).resolves.toBe(130)

    const viaTerm = fakeChild()
    const sigterm = waitForChildExit(viaTerm as never)
    viaTerm.emit('exit', null, 'SIGTERM')
    await expect(sigterm).resolves.toBe(1)

    const viaCode = fakeChild()
    const coded = waitForChildExit(viaCode as never)
    viaCode.emit('exit', 5, null)
    await expect(coded).resolves.toBe(5)

    const viaNull = fakeChild()
    const nulled = waitForChildExit(viaNull as never)
    viaNull.emit('exit', null, null)
    await expect(nulled).resolves.toBe(0)
  })

  it('rejects on child errors', async () => {
    const child = fakeChild()
    const pending = waitForChildExit(child as never)
    child.emit('error', new Error('spawn failed'))

    await expect(pending).rejects.toThrow('spawn failed')
  })
})

describe('runCommand', () => {
  it('runs commands with the process env by default', async () => {
    await expect(runCommand('node', ['-e', ''], tempDir())).resolves.toBeUndefined()
  })

  it('throws with the exit code on failure', async () => {
    await expect(runCommand('node', ['-e', 'process.exit(3)'], tempDir())).rejects.toThrow(
      'node -e process.exit(3) exited with code 3',
    )
  })

  it('accepts an explicit environment', async () => {
    await expect(
      runCommand('node', ['-e', 'process.exit(process.env.DEV_TEST_FLAG === "1" ? 0 : 2)'], tempDir(), {
        ...process.env,
        DEV_TEST_FLAG: '1',
      }),
    ).resolves.toBeUndefined()
  })
})

describe('spawnLongRunning', () => {
  it('spawns tracked children', async () => {
    const child = spawnLongRunning('node', ['-e', 'setTimeout(() => {}, 30000)'], tempDir())

    expect(child.pid).toEqual(expect.any(Number))
    child.kill()
    await expect(waitForChildExit(child)).resolves.toBe(1)
  })
})

describe('resolveWorkspaceBinary', () => {
  it('prefers the workspace binary and falls back to the root one', () => {
    const dir = tempDir()
    const binDir = join(dir, 'ws', 'node_modules', '.bin')
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(binDir, 'tool'), '')

    expect(resolveWorkspaceBinary(join(dir, 'ws'), 'tool')).toBe(join(binDir, 'tool'))
    expect(resolveWorkspaceBinary(join(dir, 'ws'), 'vitest')).toMatch(/node_modules\/\.bin\/vitest$/)
  })

  it('throws when the binary is missing everywhere', () => {
    expect(() => resolveWorkspaceBinary(tempDir(), 'nope')).toThrow('Unable to resolve binary "nope"')
  })

  it('resolves .cmd shims on Windows', () => {
    const dir = tempDir()
    const binDir = join(dir, 'node_modules', '.bin')
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(binDir, 'tool'), '')

    expect(() => resolveWorkspaceBinary(dir, 'tool', 'win32')).toThrow('Unable to resolve binary "tool"')

    writeFileSync(join(binDir, 'tool.cmd'), '')
    expect(resolveWorkspaceBinary(dir, 'tool', 'win32')).toBe(join(binDir, 'tool.cmd'))
  })
})

describe('getWorkspacePackagePath', () => {
  it('resolves installed packages and throws for missing ones', () => {
    const dir = tempDir()
    const pkgDir = join(dir, 'ws', 'node_modules', 'some-pkg')
    mkdirSync(pkgDir, { recursive: true })

    expect(getWorkspacePackagePath(join(dir, 'ws'), 'some-pkg')).toBe(pkgDir)
    expect(() => getWorkspacePackagePath(join(dir, 'ws'), 'nope')).toThrow('Unable to resolve package "nope"')
  })
})

describe('ensureElectronBinaryInstalled', () => {
  it('skips the install when the runtime is present', async () => {
    const dir = tempDir()
    const electronDir = join(dir, 'ws', 'node_modules', 'electron')
    mkdirSync(join(electronDir, 'dist'), { recursive: true })
    writeFileSync(join(electronDir, 'path.txt'), '/tmp/electron')

    await expect(ensureElectronBinaryInstalled(join(dir, 'ws'))).resolves.toBeUndefined()
  })

  it('runs the offline installer when the runtime is missing', async () => {
    const dir = tempDir()
    const electronDir = join(dir, 'ws', 'node_modules', 'electron')
    mkdirSync(electronDir, { recursive: true })
    const marker = join(dir, 'installed.txt')
    writeFileSync(join(electronDir, 'install.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ok')\n`)

    await ensureElectronBinaryInstalled(join(dir, 'ws'))

    const { readFileSync } = await import('node:fs')
    expect(readFileSync(marker, 'utf8')).toBe('ok')
  })

  it('runs the installer when only the path file exists', async () => {
    const dir = tempDir()
    const electronDir = join(dir, 'ws', 'node_modules', 'electron')
    mkdirSync(electronDir, { recursive: true })
    writeFileSync(join(electronDir, 'path.txt'), '/tmp/electron')
    const marker = join(dir, 'installed.txt')
    writeFileSync(join(electronDir, 'install.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ok')\n`)

    await ensureElectronBinaryInstalled(join(dir, 'ws'))

    const { readFileSync } = await import('node:fs')
    expect(readFileSync(marker, 'utf8')).toBe('ok')
  })
})

describe('canConnectToPort', () => {
  it('detects open and closed ports', async () => {
    const server = new Server()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as { port: number }).port

    try {
      await expect(canConnectToPort(port, '127.0.0.1')).resolves.toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    await expect(canConnectToPort(port, '127.0.0.1')).resolves.toBe(false)
  })
})

describe('waitForPort', () => {
  it('returns once the port accepts connections', async () => {
    const server = new Server()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as { port: number }).port

    try {
      await expect(waitForPort(port, 5000)).resolves.toBeUndefined()
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('throws after the timeout', async () => {
    await expect(waitForPort(1, 20)).rejects.toThrow('Timed out waiting for port 1')
  })
})

describe('registerChild', () => {
  it('tracks children until they exit', () => {
    const child = fakeChild()

    expect(registerChild(child as never)).toBe(child)
    expect(child.once).toHaveBeenCalledWith('exit', expect.any(Function))

    child.emit('exit', 0, null)
  })
})

describe('terminateChildren', () => {
  it('returns immediately when no children are tracked', async () => {
    await expect(terminateChildren()).resolves.toBeUndefined()
  })

  it('kills live children and skips dead ones', async () => {
    const live = fakeChild()
    const dead = fakeChild()
    dead.killed = true
    live.kill.mockImplementation(function (this: { killed: boolean }) {
      this.killed = true
      queueMicrotask(() => live.emit('exit', null, 'SIGTERM'))
      return true
    })
    registerChild(live as never)
    registerChild(dead as never)
    queueMicrotask(() => dead.emit('exit', 0, null))

    await terminateChildren()

    expect(live.kill).toHaveBeenCalledWith('SIGTERM')
    expect(dead.kill).not.toHaveBeenCalled()
  })

  it('escalates to SIGKILL when children ignore SIGTERM', async () => {
    vi.useFakeTimers()
    try {
      const stubborn = fakeChild()
      stubborn.kill.mockImplementation(() => true)
      registerChild(stubborn as never)
      const zombie = fakeChild()
      zombie.killed = true
      registerChild(zombie as never)

      const done = terminateChildren()
      await vi.advanceTimersByTimeAsync(6000)
      await done

      expect(stubborn.kill).toHaveBeenCalledWith('SIGTERM')
      expect(stubborn.kill).toHaveBeenCalledWith('SIGKILL')
      expect(zombie.kill).not.toHaveBeenCalled()
      stubborn.emit('exit', null, 'SIGKILL')
      zombie.emit('exit', 0, null)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forwards an explicit signal', async () => {
    const child = fakeChild()
    child.kill.mockImplementation(function (this: { killed: boolean }) {
      this.killed = true
      queueMicrotask(() => child.emit('exit', null, 'SIGINT'))
      return true
    })
    registerChild(child as never)

    await terminateChildren('SIGINT')

    expect(child.kill).toHaveBeenCalledWith('SIGINT')
  })
})

describe('shutdown', () => {
  it('terminates children once and exits', async () => {
    const child = fakeChild()
    child.kill.mockImplementation(function (this: { killed: boolean }) {
      this.killed = true
      queueMicrotask(() => child.emit('exit', null, 'SIGTERM'))
      return true
    })
    registerChild(child as never)

    await shutdown(7)

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(process.exit).toHaveBeenCalledWith(7)
  })

  it('exits without re-terminating on later calls', async () => {
    const child = fakeChild()
    registerChild(child as never)

    await shutdown(8, 'SIGINT')

    expect(child.kill).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledWith(8)
    child.emit('exit', 0, null)
  })
})

describe('installSignalHandlers', () => {
  it('maps signals to exit codes', () => {
    installSignalHandlers()

    const sigint = process.listeners('SIGINT').at(-1) as () => void
    const sigterm = process.listeners('SIGTERM').at(-1) as () => void

    sigint()
    expect(process.exit).toHaveBeenCalledWith(130)
    sigterm()
    expect(process.exit).toHaveBeenCalledWith(143)

    process.removeListener('SIGINT', sigint)
    process.removeListener('SIGTERM', sigterm)
  })
})

describe('runSingleProcessMode', () => {
  it('exits with the child exit code', async () => {
    await runSingleProcessMode('node', ['-e', 'process.exit(7)'], tempDir())

    expect(process.exit).toHaveBeenCalledWith(7)
  })
})

describe('main', () => {
  const runners = () => ({
    runDesktop: vi.fn(async (_runtime: DesktopModeRuntime, _deps: DesktopModeDependencies) => {}),
    runSingle: vi.fn(async (_command: string, _args: string[], _cwd: string) => {}),
    installHandlers: vi.fn(() => {}),
  })

  it('uses the real argv and runners by default', async () => {
    await main()

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: pnpm run dev:<'))
  })

  it('rejects unknown modes', async () => {
    await main(['bogus'], runners())

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: pnpm run dev:<'))
  })

  it.each(['dev', 'dev:desktop'] as const)('runs the desktop orchestrator for %s', async (mode) => {
    const stubbed = runners()

    await main([mode], stubbed)

    expect(stubbed.installHandlers).toHaveBeenCalledTimes(1)
    expect(stubbed.runDesktop).toHaveBeenCalledTimes(1)
    const [runtime, deps] = stubbed.runDesktop.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(runtime.desktopDir).toEqual(expect.stringContaining('apps/desktop'))
    expect(runtime.apiDir).toEqual(expect.stringContaining('apps/api'))
    for (const key of ['runCommand', 'ensureElectronBinaryInstalled', 'spawnLongRunning', 'waitForChildExit', 'waitForPort', 'shutdown', 'resolveWorkspaceBinary']) {
      expect(typeof deps[key]).toBe('function')
    }
    expect(stubbed.runSingle).not.toHaveBeenCalled()
  })

  it.each([
    { mode: 'dev:desktop:web', args: ['run', 'dev:web'], dir: 'apps/desktop' },
    { mode: 'dev:api', args: ['run', 'dev'], dir: 'apps/api' },
    { mode: 'dev:landing', args: ['run', 'dev'], dir: 'apps/landing' },
  ])('runs a single process for $mode', async ({ mode, args, dir }) => {
    const stubbed = runners()

    await main([mode], stubbed)

    expect(stubbed.installHandlers).toHaveBeenCalledTimes(1)
    expect(stubbed.runSingle).toHaveBeenCalledTimes(1)
    const [command, actualArgs, cwd] = stubbed.runSingle.mock.calls[0] as unknown as [string, string[], string]
    expect(command).toBe('pnpm')
    expect(actualArgs).toEqual(args)
    expect(cwd).toEqual(expect.stringContaining(dir))
    expect(stubbed.runDesktop).not.toHaveBeenCalled()
  })
})
