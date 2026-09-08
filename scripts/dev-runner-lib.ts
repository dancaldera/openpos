import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const API_PORT = 3001
export const VITE_PORT = 1420
export const VITE_URL = `http://localhost:${VITE_PORT}`
export const PORT_WAIT_TIMEOUT_MS = 30_000
export const DEFAULT_DESKTOP_DEV_API_URL = `http://localhost:${API_PORT}`
export const PACKAGE_RUNNER = 'pnpm'

export interface DesktopModeRuntime {
  rootDir: string
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

export function electronLaunchArgs(platform = process.platform): string[] {
  // The unpacked Electron chrome-sandbox is often not setuid 4755 on Linux,
  // which aborts startup instead of falling back to the namespace sandbox.
  if (platform === 'linux') {
    return ['--no-sandbox', '.']
  }

  return ['.']
}

export function buildDesktopDevEnvironment(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (baseEnv.VITE_API_URL || baseEnv.OPENPOS_REQUIRE_API_SETUP === '1') {
    return { ...baseEnv }
  }

  return {
    ...baseEnv,
    VITE_API_URL: DEFAULT_DESKTOP_DEV_API_URL,
  }
}

async function waitUntilListening(
  name: RuntimeName,
  port: number,
  exitPromise: Promise<{ name: RuntimeName; exitCode: number }>,
  dependencies: Pick<DesktopModeDependencies, 'waitForPort' | 'shutdown'>,
): Promise<boolean> {
  try {
    const result = await Promise.race([
      dependencies.waitForPort(port, PORT_WAIT_TIMEOUT_MS).then(() => ({ listening: true as const })),
      exitPromise.then((exit) => ({ listening: false as const, exit })),
    ])

    if (result.listening) {
      return true
    }

    const exitCode = result.exit.exitCode || 1
    console.error(
      `${name} exited before listening on port ${port} (code ${exitCode}). If that port is already in use, stop the other process and retry.`,
    )
    await dependencies.shutdown(exitCode)
    return false
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    await dependencies.shutdown(1)
    return false
  }
}

export async function runDesktopMode(
  runtime: DesktopModeRuntime,
  dependencies: DesktopModeDependencies,
): Promise<void> {
  const desktopEnv = buildDesktopDevEnvironment(runtime.env)

  const rootDir = runtime.rootDir
  const bootstrapDbPath = join(rootDir, 'packages', 'data', 'assets', 'openpos-bootstrap.sqlite')
  if (!existsSync(bootstrapDbPath)) {
    console.log('Bootstrap database missing, building it now...')
    await dependencies.runCommand(PACKAGE_RUNNER, ['run', 'build:bootstrap'], join(rootDir, 'packages', 'data'))
  }

  await dependencies.runCommand(PACKAGE_RUNNER, ['run', 'prepare:native'], runtime.desktopDir)
  await dependencies.ensureElectronBinaryInstalled(runtime.desktopDir)

  const apiProcess = dependencies.spawnLongRunning(PACKAGE_RUNNER, ['run', 'dev'], runtime.apiDir, desktopEnv)
  const apiExit = createExitTracker('api', apiProcess, dependencies.waitForChildExit)
  if (!(await waitUntilListening('api', API_PORT, apiExit, dependencies))) {
    return
  }

  const viteProcess = dependencies.spawnLongRunning(PACKAGE_RUNNER, ['run', 'dev'], runtime.desktopDir, desktopEnv)
  const viteExit = createExitTracker('vite', viteProcess, dependencies.waitForChildExit)
  if (!(await waitUntilListening('vite', VITE_PORT, viteExit, dependencies))) {
    return
  }

  console.log(`Launching Electron against ${VITE_URL}`)
  const electronProcess = dependencies.spawnLongRunning(
    dependencies.resolveWorkspaceBinary(runtime.desktopDir, 'electron'),
    electronLaunchArgs(),
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
