#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { Socket } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import {
  PORT_WAIT_TIMEOUT_MS,
  VITE_PORT,
  runDesktopMode as runDesktopModeWithApi,
} from './dev-runner-lib'

type DevMode = 'dev' | 'dev:desktop' | 'dev:desktop:web' | 'dev:api' | 'dev:landing'

const DEV_MODES: DevMode[] = ['dev', 'dev:desktop', 'dev:desktop:web', 'dev:api', 'dev:landing']
const SHUTDOWN_TIMEOUT_MS = 5_000
const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost']

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const desktopDir = join(rootDir, 'apps/desktop')
const apiDir = join(rootDir, 'apps/api')
const landingDir = join(rootDir, 'apps/landing')

const mode = process.argv[2] as DevMode | undefined
const children = new Set<ChildProcess>()
let shuttingDown = false

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

function isDevMode(value: string | undefined): value is DevMode {
  return value !== undefined && DEV_MODES.includes(value as DevMode)
}

function registerChild(child: ChildProcess): ChildProcess {
  children.add(child)
  child.once('exit', () => {
    children.delete(child)
  })
  return child
}

function waitForChildExit(child: ChildProcess): Promise<number> {
  return new Promise((resolveChild, rejectChild) => {
    child.once('error', rejectChild)
    child.once('exit', (code, signal) => {
      if (signal) {
        resolveChild(signal === 'SIGINT' ? 130 : 1)
        return
      }

      resolveChild(code ?? 0)
    })
  })
}

async function runCommand(command: string, args: string[], cwd: string, env = process.env): Promise<void> {
  const child = registerChild(
    spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    }),
  )

  const exitCode = await waitForChildExit(child)
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${exitCode}`)
  }
}

function spawnLongRunning(command: string, args: string[], cwd: string, env = process.env): ChildProcess {
  return registerChild(
    spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    }),
  )
}

function resolveWorkspaceBinary(workspaceDir: string, binaryName: string): string {
  const extension = process.platform === 'win32' ? '.cmd' : ''
  const candidates = [
    join(workspaceDir, 'node_modules', '.bin', `${binaryName}${extension}`),
    join(rootDir, 'node_modules', '.bin', `${binaryName}${extension}`),
  ]

  const match = candidates.find((candidate) => existsSync(candidate))
  if (!match) {
    throw new Error(`Unable to resolve binary "${binaryName}" from ${workspaceDir}`)
  }

  return match
}

function getWorkspacePackagePath(workspaceDir: string, packageName: string): string {
  const candidates = [
    join(workspaceDir, 'node_modules', packageName),
    join(rootDir, 'node_modules', packageName),
  ]

  const match = candidates.find((candidate) => existsSync(candidate))
  if (!match) {
    throw new Error(`Unable to resolve package "${packageName}" from ${workspaceDir}`)
  }

  return match
}

async function ensureElectronBinaryInstalled(workspaceDir: string): Promise<void> {
  const electronDir = getWorkspacePackagePath(workspaceDir, 'electron')
  const pathFile = join(electronDir, 'path.txt')
  const distDir = join(electronDir, 'dist')

  if (existsSync(pathFile) && existsSync(distDir)) {
    return
  }

  console.log('Electron runtime missing, downloading Electron dist payload')
  await runCommand('node', [join(electronDir, 'install.js')], workspaceDir, {
    ...process.env,
    npm_config_platform: process.platform,
    npm_config_arch: process.arch,
  })
}

async function canConnectToPort(port: number, host: string): Promise<boolean> {
  return new Promise<boolean>((resolvePort) => {
    const socket = new Socket()

    socket.once('connect', () => {
      socket.destroy()
      resolvePort(true)
    })

    socket.once('error', () => {
      socket.destroy()
      resolvePort(false)
    })

    socket.connect(port, host)
  })
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const results = await Promise.all(LOOPBACK_HOSTS.map((host) => canConnectToPort(port, host)))
    const isOpen = results.some(Boolean)

    if (isOpen) {
      return
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for port ${port}`)
}

async function terminateChildren(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  if (children.size === 0) {
    return
  }

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal)
    }
  }

  await delay(250)

  const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS
  while (children.size > 0 && Date.now() < deadline) {
    await delay(100)
  }

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGKILL')
    }
  }
}

async function shutdown(exitCode: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<never> {
  if (!shuttingDown) {
    shuttingDown = true
    await terminateChildren(signal)
  }

  process.exit(exitCode)
}

function installSignalHandlers(): void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

  for (const signal of signals) {
    process.on(signal, () => {
      const exitCode = signal === 'SIGINT' ? 130 : 143
      void shutdown(exitCode, signal)
    })
  }
}

async function runSingleProcessMode(command: string, args: string[], cwd: string): Promise<void> {
  const child = spawnLongRunning(command, args, cwd)
  const exitCode = await waitForChildExit(child)
  await shutdown(exitCode)
}

async function main(): Promise<void> {
  if (!isDevMode(mode)) {
    console.error(`Usage: bun scripts/dev-runner.ts <${DEV_MODES.join('|')}>`)
    process.exit(1)
  }

  installSignalHandlers()

  switch (mode) {
    case 'dev':
    case 'dev:desktop':
      await runDesktopModeWithApi(
        {
          rootDir,
          desktopDir,
          apiDir,
          env: process.env,
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
      return
    case 'dev:desktop:web':
      await runSingleProcessMode(process.execPath, ['run', 'dev:web'], desktopDir)
      return
    case 'dev:api':
      await runSingleProcessMode(process.execPath, ['run', 'dev'], apiDir)
      return
    case 'dev:landing':
      await runSingleProcessMode(process.execPath, ['run', 'dev'], landingDir)
      return
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error))
  await shutdown(1)
})
