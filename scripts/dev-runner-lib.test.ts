import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_PORT,
  API_PORT,
  buildDesktopDevEnvironment,
  DEFAULT_DESKTOP_DEV_API_URL,
  electronLaunchArgs,
  PACKAGE_RUNNER,
  runDesktopMode,
  runWebStack,
  VITE_PORT,
  VITE_URL,
  WEB_PORT,
} from './dev-runner-lib'

describe('buildDesktopDevEnvironment', () => {
  it('injects the local API URL when none is configured', () => {
    expect(buildDesktopDevEnvironment({ PATH: '/usr/bin' }).VITE_API_URL).toBe(DEFAULT_DESKTOP_DEV_API_URL)
  })

  it('preserves an explicit API URL', () => {
    expect(buildDesktopDevEnvironment({ VITE_API_URL: 'https://api.example.com' }).VITE_API_URL).toBe(
      'https://api.example.com',
    )
  })
  it('leaves the API unset when API setup is explicitly required', () => {
    expect(buildDesktopDevEnvironment({ OPENPOS_REQUIRE_API_SETUP: '1' }).VITE_API_URL).toBeUndefined()
  })
})

describe('runDesktopMode', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips the bootstrap build when the database already exists', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'openpos-dev-runner-'))
    tempDirs.push(rootDir)
    const bootstrapPath = join(rootDir, 'packages', 'data', 'assets', 'openpos-bootstrap.sqlite')
    mkdirSync(join(rootDir, 'packages', 'data', 'assets'), { recursive: true })
    writeFileSync(bootstrapPath, '')
    const calls: string[] = []
    let spawnCount = 0

    await runDesktopMode(
      { rootDir, desktopDir: join(rootDir, 'apps/desktop'), apiDir: join(rootDir, 'apps/api'), env: {} },
      {
        runCommand: vi.fn(async (_command: string, args: string[]) => {
          calls.push(`run:${args.join(' ')}`)
        }),
        ensureElectronBinaryInstalled: vi.fn(async () => {}),
        spawnLongRunning: vi.fn(() => {
          spawnCount += 1
          return { __name: ['api', 'vite', 'electron'][spawnCount - 1] } as never
        }),
        waitForChildExit: vi.fn((child: ChildProcess & { __name?: string }) =>
          child.__name === 'electron' ? Promise.resolve(0) : new Promise<number>(() => {}),
        ),
        waitForPort: vi.fn(async () => {}),
        shutdown: vi.fn(async (exitCode: number) => {
          calls.push(`shutdown:${exitCode}`)
        }),
        resolveWorkspaceBinary: vi.fn(() => '/tmp/electron'),
      },
    )

    expect(calls).not.toContain('run:run build:bootstrap')
    expect(calls).toContain('run:run prepare:native')
    expect(calls).toContain('shutdown:0')
  })

  it('waits for the API and Vite before launching Electron', async () => {
    const calls: string[] = []
    let spawnCount = 0

    const runCommand = vi.fn(async (_command: string, args: string[]) => {
      calls.push(`run:${args.join(' ')}`)
    })
    const ensureElectronBinaryInstalled = vi.fn(async () => {
      calls.push('ensure:electron')
    })
    const spawnLongRunning = vi.fn((command: string, args: string[], _cwd: string, env?: NodeJS.ProcessEnv) => {
      spawnCount += 1

      if (spawnCount === 1) {
        calls.push(`spawn:api:${command}:${args.join(' ')}`)
        expect(env?.VITE_API_URL).toBe(DEFAULT_DESKTOP_DEV_API_URL)
        return { __name: 'api' } as never
      }

      if (spawnCount === 2) {
        calls.push(`spawn:vite:${command}:${args.join(' ')}`)
        expect(env?.VITE_API_URL).toBe(DEFAULT_DESKTOP_DEV_API_URL)
        return { __name: 'vite' } as never
      }

      calls.push(`spawn:electron:${command}:${args.join(' ')}`)
      expect(env?.VITE_API_URL).toBe(DEFAULT_DESKTOP_DEV_API_URL)
      expect(env?.VITE_DEV_SERVER_URL).toBe(VITE_URL)
      return { __name: 'electron' } as never
    })
    const waitForChildExit = vi.fn((child: ChildProcess & { __name?: string }) => {
      if (child.__name === 'electron') {
        return Promise.resolve(0)
      }

      return new Promise<number>(() => {})
    })
    const waitForPort = vi.fn(async (port: number) => {
      calls.push(`wait:${port}`)
    })
    const shutdown = vi.fn(async (exitCode: number) => {
      calls.push(`shutdown:${exitCode}`)
    })
    const resolveWorkspaceBinary = vi.fn(() => '/tmp/electron')

    await runDesktopMode(
      {
        rootDir: '/workspace',
        desktopDir: '/workspace/apps/desktop',
        apiDir: '/workspace/apps/api',
        env: {},
      },
      {
        runCommand,
        ensureElectronBinaryInstalled,
        spawnLongRunning,
        waitForChildExit,
        waitForPort,
        shutdown,
        resolveWorkspaceBinary,
      },
    )

    expect(calls).toEqual([
      'run:run build:bootstrap',
      'run:run prepare:native',
      'ensure:electron',
      `spawn:api:${PACKAGE_RUNNER}:run dev`,
      `wait:${API_PORT}`,
      `spawn:vite:${PACKAGE_RUNNER}:run dev`,
      `wait:${VITE_PORT}`,
      `spawn:electron:/tmp/electron:${electronLaunchArgs().join(' ')}`,
      'shutdown:0',
    ])
  })

  it('stops when the API exits before it starts listening', async () => {
    const calls: string[] = []
    const runCommand = vi.fn(async (_command: string, args: string[]) => {
      calls.push(`run:${args.join(' ')}`)
    })
    const spawnLongRunning = vi.fn((command: string, args: string[]) => {
      calls.push(`spawn:${command}:${args.join(' ')}`)
      return { __name: 'api' } as never
    })
    const waitForChildExit = vi.fn(() => Promise.resolve(1))
    const waitForPort = vi.fn(() => new Promise<void>(() => {}))
    const shutdown = vi.fn(async (exitCode: number) => {
      calls.push(`shutdown:${exitCode}`)
    })

    await runDesktopMode(
      {
        rootDir: '/workspace',
        desktopDir: '/workspace/apps/desktop',
        apiDir: '/workspace/apps/api',
        env: {},
      },
      {
        runCommand,
        ensureElectronBinaryInstalled: vi.fn(async () => {
          calls.push('ensure:electron')
        }),
        spawnLongRunning,
        waitForChildExit,
        waitForPort,
        shutdown,
        resolveWorkspaceBinary: vi.fn(() => '/tmp/electron'),
      },
    )

    expect(calls).toEqual([
      'run:run build:bootstrap',
      'run:run prepare:native',
      'ensure:electron',
      `spawn:${PACKAGE_RUNNER}:run dev`,
      'shutdown:1',
    ])
    expect(spawnLongRunning).toHaveBeenCalledTimes(1)
  })

  it('stops when Vite exits before it starts listening', async () => {
    const calls: string[] = []
    let spawnCount = 0
    const spawnLongRunning = vi.fn(() => {
      spawnCount += 1
      calls.push(`spawn:${spawnCount}`)
      return { __name: spawnCount === 1 ? 'api' : 'vite' } as never
    })
    const waitForChildExit = vi.fn((child: ChildProcess & { __name?: string }) => {
      if (child.__name === 'vite') {
        return Promise.resolve(0)
      }
      return new Promise<number>(() => {})
    })
    const waitForPort = vi.fn((port: number) => {
      if (port === API_PORT) {
        return Promise.resolve()
      }
      return new Promise<void>(() => {})
    })
    const shutdown = vi.fn(async (exitCode: number) => {
      calls.push(`shutdown:${exitCode}`)
    })

    await runDesktopMode(
      {
        rootDir: '/workspace',
        desktopDir: '/workspace/apps/desktop',
        apiDir: '/workspace/apps/api',
        env: {},
      },
      {
        runCommand: vi.fn(async () => {}),
        ensureElectronBinaryInstalled: vi.fn(async () => {}),
        spawnLongRunning,
        waitForChildExit,
        waitForPort,
        shutdown,
        resolveWorkspaceBinary: vi.fn(() => '/tmp/electron'),
      },
    )

    expect(calls).toEqual(['spawn:1', 'spawn:2', 'shutdown:1'])
    expect(spawnLongRunning).toHaveBeenCalledTimes(2)
  })

  it.each([
    { firstExit: 'api', exitCode: 0, expectedShutdown: 1 },
    { firstExit: 'vite', exitCode: 0, expectedShutdown: 1 },
    { firstExit: 'api', exitCode: 3, expectedShutdown: 3 },
    { firstExit: 'electron', exitCode: 0, expectedShutdown: 0 },
  ])(
    'shuts down ($firstExit exits $exitCode) once Electron is running',
    async ({ firstExit, exitCode, expectedShutdown }) => {
      const shutdown = vi.fn(async () => {})
      let spawnCount = 0

      await runDesktopMode(
        {
          rootDir: '/workspace',
          desktopDir: '/workspace/apps/desktop',
          apiDir: '/workspace/apps/api',
          env: {},
        },
        {
          runCommand: vi.fn(async () => {}),
          ensureElectronBinaryInstalled: vi.fn(async () => {}),
          spawnLongRunning: vi.fn(() => {
            spawnCount += 1
            return { __name: ['api', 'vite', 'electron'][spawnCount - 1] } as never
          }),
          waitForChildExit: vi.fn((child: ChildProcess & { __name?: string }) => {
            if (child.__name === firstExit) {
              return Promise.resolve(exitCode)
            }
            return new Promise<number>(() => {})
          }),
          waitForPort: vi.fn(async () => {}),
          shutdown,
          resolveWorkspaceBinary: vi.fn(() => '/tmp/electron'),
        },
      )

      expect(shutdown).toHaveBeenCalledWith(expectedShutdown)
    },
  )

  it.each([new Error('port check failed'), 'port check failed'])(
    'shuts down when waiting for a port throws %s',
    async (failure) => {
      const shutdown = vi.fn(async () => {})

      await runDesktopMode(
        {
          rootDir: '/workspace',
          desktopDir: '/workspace/apps/desktop',
          apiDir: '/workspace/apps/api',
          env: {},
        },
        {
          runCommand: vi.fn(async () => {}),
          ensureElectronBinaryInstalled: vi.fn(async () => {}),
          spawnLongRunning: vi.fn(() => ({ __name: 'api' }) as never),
          waitForChildExit: vi.fn(() => new Promise<number>(() => {})),
          waitForPort: vi.fn(async () => {
            throw failure
          }),
          shutdown,
          resolveWorkspaceBinary: vi.fn(() => '/tmp/electron'),
        },
      )

      expect(shutdown).toHaveBeenCalledWith(1)
    },
  )
})

describe('electronLaunchArgs', () => {
  it('disables the SUID sandbox on Linux', () => {
    expect(electronLaunchArgs('linux')).toEqual(['--no-sandbox', '.'])
  })

  it('launches the app path only on other platforms', () => {
    expect(electronLaunchArgs('darwin')).toEqual(['.'])
    expect(electronLaunchArgs('win32')).toEqual(['.'])
  })
})

describe('runDesktopMode seeding', () => {
  it('seeds the local control plane before starting the API when an admin dir is given', async () => {
    const calls: string[] = []
    let spawnCount = 0
    await runDesktopMode(
      {
        rootDir: '/workspace',
        desktopDir: '/workspace/apps/desktop',
        apiDir: '/workspace/apps/api',
        adminDir: '/workspace/apps/admin',
        env: {},
      },
      {
        runCommand: vi.fn(async (_command: string, args: string[], cwd: string) => {
          calls.push(`run:${args.join(' ')}@${cwd}`)
        }),
        ensureElectronBinaryInstalled: vi.fn(async () => {}),
        spawnLongRunning: vi.fn(() => {
          spawnCount += 1
          calls.push(`spawn:${spawnCount}`)
          return { __name: ['api', 'vite', 'electron'][spawnCount - 1] } as never
        }),
        waitForChildExit: vi.fn((child: ChildProcess & { __name?: string }) =>
          child.__name === 'electron' ? Promise.resolve(0) : new Promise<number>(() => {}),
        ),
        waitForPort: vi.fn(async () => {}),
        shutdown: vi.fn(async () => {}),
        resolveWorkspaceBinary: vi.fn(() => '/tmp/electron'),
      },
    )
    expect(calls.indexOf('run:run seed:dev@/workspace/apps/admin')).toBeLessThan(calls.indexOf('spawn:1'))
  })
})

describe('runWebStack', () => {
  const runtime = { desktopDir: '/w/apps/desktop', apiDir: '/w/apps/api', adminDir: '/w/apps/admin', env: { A: '1' } }

  function deps(options: { exitFirst?: string; exitCode?: number; failPort?: number; seedFails?: unknown } = {}) {
    const calls: string[] = []
    return {
      calls,
      deps: {
        runCommand: vi.fn(async (_command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => {
          calls.push(`run:${args.join(' ')}@${cwd}:${env?.A}`)
          if (options.seedFails !== undefined) throw options.seedFails
        }),
        spawnLongRunning: vi.fn((_command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => {
          calls.push(`spawn:${args.join(' ')}@${cwd}:${env?.A}`)
          return { __cwd: cwd } as never
        }),
        waitForChildExit: vi.fn((child: ChildProcess & { __cwd?: string }) =>
          options.exitFirst && child.__cwd?.endsWith(options.exitFirst)
            ? Promise.resolve(options.exitCode ?? 0)
            : new Promise<number>(() => {}),
        ),
        waitForPort: vi.fn((port: number) => {
          calls.push(`wait:${port}`)
          return port === options.failPort ? new Promise<void>(() => {}) : Promise.resolve()
        }),
        shutdown: vi.fn(async (code: number) => {
          calls.push(`shutdown:${code}`)
        }),
      },
    }
  }

  it('starts API, admin, and web in order, seeds, then stops when one exits', async () => {
    const { calls, deps: d } = deps()
    // The admin exit tracker is created before seeding, so resolve it lazily.
    let resolveAdmin: (code: number) => void = () => {}
    d.waitForChildExit.mockImplementation((child: ChildProcess & { __cwd?: string }) =>
      child.__cwd?.endsWith('admin')
        ? new Promise<number>((resolve) => (resolveAdmin = resolve))
        : new Promise<number>(() => {}),
    )
    d.runCommand.mockImplementation(async (_command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => {
      calls.push(`run:${args.join(' ')}@${cwd}:${env?.A}`)
      queueMicrotask(() => resolveAdmin(0))
    })

    await runWebStack(runtime, d)

    expect(calls).toEqual([
      'spawn:run dev@/w/apps/api:1',
      `wait:${API_PORT}`,
      'spawn:run dev@/w/apps/admin:1',
      `wait:${ADMIN_PORT}`,
      'spawn:run dev:web@/w/apps/desktop:1',
      `wait:${WEB_PORT}`,
      'run:run seed:dev@/w/apps/admin:1',
      'shutdown:1',
    ])
  })

  it('stops when a service exits before it listens', async () => {
    const { calls, deps: d } = deps({ exitFirst: 'admin', exitCode: 2, failPort: ADMIN_PORT })
    await runWebStack(runtime, d)
    expect(calls.at(-1)).toBe('shutdown:2')
    expect(calls.some((call) => call.includes('dev:web'))).toBe(false)
  })

  it('keeps a non-zero exit code once running', async () => {
    let resolveApi: (code: number) => void = () => {}
    const { calls, deps: d } = deps()
    d.waitForChildExit.mockImplementation((child: ChildProcess & { __cwd?: string }) =>
      child.__cwd?.endsWith('api')
        ? new Promise<number>((resolve) => (resolveApi = resolve))
        : new Promise<number>(() => {}),
    )
    d.runCommand.mockImplementation(async () => {
      queueMicrotask(() => resolveApi(3))
    })
    await runWebStack(runtime, d)
    expect(calls.at(-1)).toBe('shutdown:3')
  })

  it.each([new Error('seed failed'), 'seed failed'])('shuts down when seeding fails (%s)', async (failure) => {
    const { calls, deps: d } = deps({ seedFails: failure })
    await runWebStack(runtime, d)
    expect(calls.at(-1)).toBe('shutdown:1')
  })
})
