/**
 * File-backed provisioner for local development. Node only: never import it
 * from a Worker entry.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ControlPlaneError } from './errors.ts'
import { assertDatabaseName, type DatabaseProvisioner } from './provisioner.ts'

export function localProvisioner(directory: string): DatabaseProvisioner {
  const root = resolve(directory)
  const pathFor = (name: string) => join(root, `${assertDatabaseName(name)}.sqlite`)

  return {
    kind: 'local',
    description: `Local SQLite files in ${root}`,
    async listDatabases() {
      if (!existsSync(root)) return []
      return readdirSync(root)
        .filter((file) => file.endsWith('.sqlite'))
        .sort()
        .map((file) => ({ name: file.slice(0, -'.sqlite'.length), hostname: 'localhost', group: 'local', regions: [] }))
    },
    async createDatabase(name) {
      const path = pathFor(name)
      if (existsSync(path)) throw new ControlPlaneError(`Database "${name}" already exists`, 409)
      mkdirSync(root, { recursive: true })
      writeFileSync(path, '')
      return { name, hostname: 'localhost', group: 'local', regions: [] }
    },
    async deleteDatabase(name) {
      const path = pathFor(name)
      for (const file of [path, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true })
    },
    async connect(name) {
      const path = pathFor(name)
      if (!existsSync(path)) throw new Error(`Database "${name}" was not found`)
      return { url: `file:${path}` }
    },
  }
}
