import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ChildProcess } from 'node:child_process'

export const API_PORT = 3001
export const VITE_PORT = 1420
export const VITE_URL = `http://localhost:${VITE_PORT}`
export const PORT_WAIT_TIMEOUT_MS = 30_000
export const DEFAULT_DESKTOP_DEV_API_URL = `http://localhost:${API_PORT}`

export interface DesktopModeRuntime {
  desktopDir: string
  apiDir: string
  env?: NodeJS.ProcessEnv
}

export interface DesktopModeDependencies {
  runCommand(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<void>
  ensureElectronBinaryInstalled(workspaceDir: string): Promise<void>
  spawnLongRunning(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): ChildProcess
  waitForChildExit(child: ChildProcess): Promise<number>
  waitForPort(port: number, timeoutMs: number): Promise<void>
  shutdown(exitCode: number): Promise<void>
  resolveWorkspaceBinary(workspaceDir: string, binaryName: string): string
}

type RuntimeName = 'api' | 'vite' | 'electron'

function createExitTracker(
  name: RuntimeName,
  child: ChildProcess,
  waitForChildExit: DesktopModeDependencies['waitForChildExit'],
) {
  return waitForChildExit(child).then((exitCode) => ({
    name,
    exitCode,
  }))
}

export function buildDesktopDevEnvironment(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (baseEnv.VITE_API_URL) {
    return { ...baseEnv }
  }

  return {
    ...baseEnv,
    VITE_API_URL: DEFAULT_DESKTOP_DEV_API_URL,
  }
}

export async function runDesktopMode(
  runtime: DesktopModeRuntime,
  dependencies: DesktopModeDependencies,
): Promise<void> {
  const desktopEnv = buildDesktopDevEnvironment(runtime.env)

  const rootDir = dirname(runtime.desktopDir)
  const bootstrapDbPath = join(rootDir, 'packages', 'data', 'assets', 'openpos-bootstrap.sqlite')
  if (!existsSync(bootstrapDbPath)) {
    console.log('Bootstrap database missing, building it now...')
    await dependencies.runCommand('bun', ['run', 'build:bootstrap'], join(rootDir, 'packages', 'data'))
  }

  await dependencies.runCommand('bun', ['run', 'prepare:native'], runtime.desktopDir)
  await dependencies.ensureElectronBinaryInstalled(runtime.desktopDir)

  const apiProcess = dependencies.spawnLongRunning('bun', ['run', 'dev'], runtime.apiDir, desktopEnv)
  const apiExit = createExitTracker('api', apiProcess, dependencies.waitForChildExit)

  try {
    await dependencies.waitForPort(API_PORT, PORT_WAIT_TIMEOUT_MS)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    await dependencies.shutdown(1)
    return
  }

  const viteProcess = dependencies.spawnLongRunning('bun', ['run', 'dev'], runtime.desktopDir, desktopEnv)
  const viteExit = createExitTracker('vite', viteProcess, dependencies.waitForChildExit)

  try {
    await dependencies.waitForPort(VITE_PORT, PORT_WAIT_TIMEOUT_MS)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    await dependencies.shutdown(1)
    return
  }

  console.log(`Launching Electron against ${VITE_URL}`)
  const electronProcess = dependencies.spawnLongRunning(
    dependencies.resolveWorkspaceBinary(runtime.desktopDir, 'electron'),
    ['.'],
    runtime.desktopDir,
    {
      ...desktopEnv,
      VITE_DEV_SERVER_URL: VITE_URL,
    },
  )
  const electronExit = createExitTracker('electron', electronProcess, dependencies.waitForChildExit)

  const firstExit = await Promise.race([apiExit, viteExit, electronExit])
  if ((firstExit.name === 'api' || firstExit.name === 'vite') && firstExit.exitCode === 0) {
    console.error(`${firstExit.name} exited before Electron was closed`)
    await dependencies.shutdown(1)
    return
  }

  await dependencies.shutdown(firstExit.exitCode)
}
