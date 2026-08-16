import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, mock } from 'bun:test'
import {
  API_PORT,
  DEFAULT_DESKTOP_DEV_API_URL,
  VITE_PORT,
  VITE_URL,
  buildDesktopDevEnvironment,
  runDesktopMode,
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

    const runCommand = mock(async (_command: string, args: string[]) => {
      calls.push(`run:${args.join(' ')}`)
    })
    const ensureElectronBinaryInstalled = mock(async () => {
      calls.push('ensure:electron')
    })
    const spawnLongRunning = mock((command: string, args: string[], _cwd: string, env?: NodeJS.ProcessEnv) => {
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
    const waitForChildExit = mock((child: ChildProcess & { __name?: string }) => {
      if (child.__name === 'electron') {
        return Promise.resolve(0)
      }

      return new Promise<number>(() => {})
    })
    const waitForPort = mock(async (port: number) => {
      calls.push(`wait:${port}`)
    })
    const shutdown = mock(async (exitCode: number) => {
      calls.push(`shutdown:${exitCode}`)
    })
    const resolveWorkspaceBinary = mock(() => '/tmp/electron')

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
      `spawn:api:${process.execPath}:run dev`,
      `wait:${API_PORT}`,
      `spawn:vite:${process.execPath}:run dev`,
      `wait:${VITE_PORT}`,
      'spawn:electron:/tmp/electron:.',
      'shutdown:0',
    ])
  })
})
