/**
 * Seeds the local control plane used by `pnpm run dev`: a root admin user and
 * a demo store backed by a local SQLite file. Safe to run repeatedly.
 */

import { type ControlPlane, controlPlaneFromEnv, type DatabaseProvisioner } from '@openpos/control-plane'
import { localProvisioner } from '@openpos/control-plane/local'
import { type AdminEnv, storeWebUrl } from './env.ts'

export const DEV_ROOT = { email: 'root@openpos.test', password: 'OpenPOS!dev1' }
export const DEV_OWNER = { name: 'Demo Admin', email: 'admin@openpos.test', password: 'OpenPOS!dev1' }
export const DEV_STORE = { name: 'Demo Store', slug: 'demo' }

export interface DevSeedResult {
  createdRoot: boolean
  createdStore: boolean
  connectionKey: string
}

export async function seedDevStack(plane: ControlPlane, provisioner: DatabaseProvisioner): Promise<DevSeedResult> {
  let createdRoot = false
  if ((await plane.rootUserCount()) === 0) {
    await plane.createRootUser(DEV_ROOT.email, DEV_ROOT.password)
    createdRoot = true
  }

  const existing = await plane.findStore({ slug: DEV_STORE.slug })
  if (existing) return { createdRoot, createdStore: false, connectionKey: existing.connectionKey }

  const databaseName = `openpos-${DEV_STORE.slug}`
  const known = (await provisioner.listDatabases()).some((database) => database.name === databaseName)
  const { connectionKey } = known
    ? await plane.attachDatabase(provisioner, { ...DEV_STORE, databaseName, owner: DEV_OWNER })
    : await plane.createStore(provisioner, { ...DEV_STORE, databaseName, owner: DEV_OWNER })
  return { createdRoot, createdStore: true, connectionKey }
}

export function describeDevStack(env: AdminEnv, result: DevSeedResult): string {
  const web = storeWebUrl(env, DEV_STORE.slug)
  return [
    '',
    'OpenPOS local stack',
    `  Web (demo store)  ${web}  (http://localhost:5173 asks for the connection key)`,
    `  Admin             http://localhost:${env.ADMIN_PORT ?? 3002}  ${DEV_ROOT.email} / ${DEV_ROOT.password}`,
    `  API               ${env.PUBLIC_API_URL}`,
    `  Store sign-in     ${DEV_OWNER.email} / ${DEV_OWNER.password}`,
    `  Connection key    ${result.connectionKey}`,
    '',
  ].join('\n')
}

/* c8 ignore start -- CLI entry point */
if (import.meta.main) {
  const env = process.env as AdminEnv
  if (!env.LOCAL_DATABASES_DIR) throw new Error('LOCAL_DATABASES_DIR is required')
  const result = await seedDevStack(controlPlaneFromEnv(env), localProvisioner(env.LOCAL_DATABASES_DIR))
  console.log(describeDevStack(env, result))
}
/* c8 ignore stop */
