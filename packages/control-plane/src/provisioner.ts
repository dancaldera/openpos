import { ControlPlaneError } from './errors.ts'
import type { DataPlaneConfig } from './sql.ts'
import { TursoPlatform, type TursoPlatformConfig } from './turso.ts'

export interface ProvisionedDatabase {
  name: string
  hostname: string
  group: string | null
  regions: string[]
}

/** Creates and connects store databases (Turso in production, local files in dev). */
export interface DatabaseProvisioner {
  readonly kind: 'turso' | 'local'
  readonly description: string
  listDatabases(): Promise<ProvisionedDatabase[]>
  createDatabase(name: string): Promise<ProvisionedDatabase>
  deleteDatabase(name: string): Promise<void>
  /** Mint credentials the API and POS devices use to reach the database. */
  connect(name: string): Promise<DataPlaneConfig>
}

export function tursoProvisioner(config: TursoPlatformConfig | TursoPlatform): DatabaseProvisioner {
  const platform = config instanceof TursoPlatform ? config : new TursoPlatform(config)
  return {
    kind: 'turso',
    description: `Turso org "${platform.org}" (group "${platform.group || 'default'}")`,
    async listDatabases() {
      return (await platform.listDatabases()).map(({ name, hostname, group, regions }) => ({
        name,
        hostname,
        group,
        regions,
      }))
    },
    async createDatabase(name) {
      const created = await platform.createDatabase(name)
      return { name: created.name, hostname: created.hostname, group: created.group, regions: created.regions }
    },
    deleteDatabase: (name) => platform.deleteDatabase(name),
    async connect(name) {
      const database = await platform.getDatabase(name)
      if (!database) throw new Error(`Turso database "${name}" was not found`)
      return { url: `libsql://${database.hostname}`, authToken: await platform.createToken(name) }
    },
  }
}

export const DATABASE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/

export function assertDatabaseName(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (!DATABASE_NAME_PATTERN.test(normalized)) {
    throw new ControlPlaneError('Database names use lowercase letters, numbers, and dashes (max 63 characters)')
  }
  return normalized
}
