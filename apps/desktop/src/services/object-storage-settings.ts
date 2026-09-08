import { requestApiJson } from '../lib/api-client'
import { execute, query } from '../lib/db-adapter'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'

export interface ObjectStorageSettings {
  configured: boolean
  endpoint: string | null
  region: string
  bucket: string | null
  urlTtlSeconds: number
  updatedAt: string | null
}

interface ObjectStorageSettingsResponse {
  settings: ObjectStorageSettings
}

interface ObjectStorageSecretsRow {
  access_key_id_encrypted?: string | null
  secret_access_key_encrypted?: string | null
}

/**
 * Mirror the saved configuration into the local object_storage_settings row.
 * The hosted API remains the source of truth (it encrypts with its own key);
 * this keeps the local database in sync so both hold the same configuration.
 * Secrets are re-encrypted locally with the device key; values already stored
 * locally are preserved when the caller did not re-enter them.
 */
async function mirrorLocalSettings(
  settings: ObjectStorageSettings,
  input: { accessKeyId?: string; secretAccessKey?: string },
): Promise<void> {
  if (!isDesktop) return

  const desktop = requireDesktopApi()
  const existing = (
    await query<ObjectStorageSecretsRow>(
      'SELECT access_key_id_encrypted, secret_access_key_encrypted FROM object_storage_settings WHERE id = 1 LIMIT 1',
    )
  )[0]
  const accessKeyIdEncrypted = input.accessKeyId
    ? await desktop.encryptSecret(input.accessKeyId)
    : existing?.access_key_id_encrypted || null
  const secretAccessKeyEncrypted = input.secretAccessKey
    ? await desktop.encryptSecret(input.secretAccessKey)
    : existing?.secret_access_key_encrypted || null
  const now = new Date().toISOString()

  const updated = await execute(
    `UPDATE object_storage_settings
     SET endpoint = ?, region = ?, bucket = ?, access_key_id_encrypted = ?, secret_access_key_encrypted = ?, url_ttl_seconds = ?, updated_at = ?
     WHERE id = 1`,
    [
      settings.endpoint,
      settings.region,
      settings.bucket,
      accessKeyIdEncrypted,
      secretAccessKeyEncrypted,
      settings.urlTtlSeconds,
      now,
    ],
  )

  if (updated.rowsAffected === 0) {
    await execute(
      `INSERT INTO object_storage_settings
       (id, endpoint, region, bucket, access_key_id_encrypted, secret_access_key_encrypted, url_ttl_seconds, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settings.endpoint,
        settings.region,
        settings.bucket,
        accessKeyIdEncrypted,
        secretAccessKeyEncrypted,
        settings.urlTtlSeconds,
        now,
        now,
      ],
    )
  }
}

export class ObjectStorageSettingsService {
  async getSettings(): Promise<ObjectStorageSettings> {
    const data = await requestApiJson<ObjectStorageSettingsResponse>('/api/settings/object-storage', {
      requireAuth: true,
    })
    return data.settings
  }

  async saveSettings(input: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId?: string
    secretAccessKey?: string
    urlTtlSeconds: number
  }): Promise<ObjectStorageSettings> {
    const data = await requestApiJson<ObjectStorageSettingsResponse>('/api/settings/object-storage', {
      method: 'PUT',
      requireAuth: true,
      body: input,
    })
    await mirrorLocalSettings(data.settings, input)
    return data.settings
  }

  async clearSettings(): Promise<void> {
    await requestApiJson('/api/settings/object-storage', {
      method: 'DELETE',
      requireAuth: true,
    })
    if (isDesktop) {
      await execute('DELETE FROM object_storage_settings WHERE id = 1')
    }
  }
}

export const objectStorageSettingsService = new ObjectStorageSettingsService()
