import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  API_PORT,
  buildDesktopDevEnvironment,
  DEFAULT_DESKTOP_DEV_API_URL,
  PACKAGE_RUNNER,
  runDesktopMode,
  VITE_PORT,
  VITE_URL,
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
})

describe('runDesktopMode', () => {
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
      'spawn:electron:/tmp/electron:.',
      'shutdown:0',
    ])
  })
})
