import { requestApiJson } from '../lib/api-client'

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

export class ObjectStorageSettingsService {
  private static instance: ObjectStorageSettingsService

  static getInstance(): ObjectStorageSettingsService {
    if (!ObjectStorageSettingsService.instance) {
      ObjectStorageSettingsService.instance = new ObjectStorageSettingsService()
    }
    return ObjectStorageSettingsService.instance
  }

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
    return data.settings
  }

  async clearSettings(): Promise<void> {
    await requestApiJson('/api/settings/object-storage', {
      method: 'DELETE',
      requireAuth: true,
    })
  }
}

export const objectStorageSettingsService = ObjectStorageSettingsService.getInstance()
