import { requestApiJson } from '../lib/api-client'

export interface PasswordResetSettings {
  configured: boolean
  fromEmail: string | null
  webAppUrl: string | null
  updatedAt: string | null
}

interface PasswordResetSettingsResponse {
  settings: PasswordResetSettings
}

export class PasswordResetSettingsService {
  private static instance: PasswordResetSettingsService

  static getInstance(): PasswordResetSettingsService {
    if (!PasswordResetSettingsService.instance) {
      PasswordResetSettingsService.instance = new PasswordResetSettingsService()
    }
    return PasswordResetSettingsService.instance
  }

  async getSettings(): Promise<PasswordResetSettings> {
    const data = await requestApiJson<PasswordResetSettingsResponse>('/api/settings/password-reset', {
      requireAuth: true,
    })
    return data.settings
  }

  async saveSettings(input: {
    resendApiKey?: string
    fromEmail: string
    webAppUrl?: string
  }): Promise<PasswordResetSettings> {
    const data = await requestApiJson<PasswordResetSettingsResponse>('/api/settings/password-reset', {
      method: 'PUT',
      requireAuth: true,
      body: input,
    })
    return data.settings
  }

  async clearSettings(): Promise<void> {
    await requestApiJson('/api/settings/password-reset', {
      method: 'DELETE',
      requireAuth: true,
    })
  }
}

export const passwordResetSettingsService = PasswordResetSettingsService.getInstance()
