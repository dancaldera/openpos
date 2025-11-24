import Database from '@tauri-apps/plugin-sql'

export interface CompanySettings {
  id: string
  name: string
  description: string
  taxEnabled: boolean
  taxPercentage: number
  currencySymbol: string
  language: string
  logoUrl?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  receiptFooter?: string
  createdAt: string
  updatedAt: string
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
] as const

export const SUPPORTED_CURRENCIES = [
  { symbol: '$', name: 'US Dollar (USD)' },
  { symbol: '€', name: 'Euro (EUR)' },
  { symbol: '£', name: 'British Pound (GBP)' },
  { symbol: '¥', name: 'Japanese Yen (JPY)' },
  { symbol: '₹', name: 'Indian Rupee (INR)' },
  { symbol: 'C$', name: 'Canadian Dollar (CAD)' },
  { symbol: 'A$', name: 'Australian Dollar (AUD)' },
  { symbol: '₽', name: 'Russian Ruble (RUB)' },
  { symbol: '¥', name: 'Chinese Yuan (CNY)' },
  { symbol: '₩', name: 'South Korean Won (KRW)' },
  { symbol: 'MX$', name: 'Mexican Peso (MXN)' },
] as const

interface DatabaseCompanySettings {
  id: number
  name: string
  description: string
  tax_enabled: number
  tax_percentage: number
  currency_symbol: string
  language: string
  logo_url?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  created_at: string
  updated_at: string
}

export class CompanySettingsService {
  private static instance: CompanySettingsService
  private db: Database | null = null

  static getInstance(): CompanySettingsService {
    if (!CompanySettingsService.instance) {
      CompanySettingsService.instance = new CompanySettingsService()
    }
    return CompanySettingsService.instance
  }

  private async getDatabase(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.load('sqlite:postpos.db')
    }
    return this.db
  }

  private convertDbSettings(dbSettings: DatabaseCompanySettings): CompanySettings {
    return {
      id: dbSettings.id.toString(),
      name: dbSettings.name,
      description: dbSettings.description,
      taxEnabled: Boolean(dbSettings.tax_enabled),
      taxPercentage: dbSettings.tax_percentage,
      currencySymbol: dbSettings.currency_symbol,
      language: dbSettings.language,
      logoUrl: dbSettings.logo_url,
      address: dbSettings.address,
      phone: dbSettings.phone,
      email: dbSettings.email,
      website: dbSettings.website,
      createdAt: dbSettings.created_at,
      updatedAt: dbSettings.updated_at,
    }
  }

  async getSettings(): Promise<CompanySettings> {
    try {
      // Force fresh database connection to prevent stale connection issues
      this.db = null
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 100))

      const settings = await db.select<DatabaseCompanySettings[]>('SELECT * FROM company_settings WHERE id = 1 LIMIT 1')

      if (settings.length === 0) {
        throw new Error('Company settings not found')
      }

      return this.convertDbSettings(settings[0])
    } catch (error) {
      console.error('Get company settings error:', error)
      throw new Error('Failed to fetch company settings')
    }
  }

  async updateSettings(
    updates: Partial<Omit<CompanySettings, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<{ success: boolean; settings?: CompanySettings; error?: string }> {
    if (updates.name !== undefined && !updates.name.trim()) {
      return { success: false, error: 'Company name is required' }
    }

    if (updates.taxPercentage !== undefined && (updates.taxPercentage < 0 || updates.taxPercentage > 100)) {
      return { success: false, error: 'Tax percentage must be between 0 and 100' }
    }

    if (updates.email !== undefined && updates.email && !this.isValidEmail(updates.email)) {
      return { success: false, error: 'Please enter a valid email address' }
    }

    if (updates.website !== undefined && updates.website && !this.isValidUrl(updates.website)) {
      return { success: false, error: 'Please enter a valid website URL' }
    }

    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const updateFields = []
      const updateValues = []

      if (updates.name !== undefined) {
        updateFields.push('name = ?')
        updateValues.push(updates.name)
      }

      if (updates.description !== undefined) {
        updateFields.push('description = ?')
        updateValues.push(updates.description)
      }

      if (updates.taxEnabled !== undefined) {
        updateFields.push('tax_enabled = ?')
        updateValues.push(updates.taxEnabled ? 1 : 0)
      }

      if (updates.taxPercentage !== undefined) {
        updateFields.push('tax_percentage = ?')
        updateValues.push(updates.taxPercentage)
      }

      if (updates.currencySymbol !== undefined) {
        updateFields.push('currency_symbol = ?')
        updateValues.push(updates.currencySymbol)
      }

      if (updates.language !== undefined) {
        updateFields.push('language = ?')
        updateValues.push(updates.language)
      }

      if (updates.logoUrl !== undefined) {
        updateFields.push('logo_url = ?')
        updateValues.push(updates.logoUrl || null)
      }

      if (updates.address !== undefined) {
        updateFields.push('address = ?')
        updateValues.push(updates.address || null)
      }

      if (updates.phone !== undefined) {
        updateFields.push('phone = ?')
        updateValues.push(updates.phone || null)
      }

      if (updates.email !== undefined) {
        updateFields.push('email = ?')
        updateValues.push(updates.email || null)
      }

      if (updates.website !== undefined) {
        updateFields.push('website = ?')
        updateValues.push(updates.website || null)
      }

      updateFields.push('updated_at = ?')
      updateValues.push(new Date().toISOString())
      updateValues.push(1) // id = 1

      if (updateFields.length > 1) {
        // More than just updated_at
        await db.execute(`UPDATE company_settings SET ${updateFields.join(', ')} WHERE id = ?`, updateValues)
      }

      const updatedSettings = await db.select<DatabaseCompanySettings[]>(
        'SELECT * FROM company_settings WHERE id = 1 LIMIT 1',
      )

      return {
        success: true,
        settings: this.convertDbSettings(updatedSettings[0]),
      }
    } catch (error) {
      console.error('Update company settings error:', error)
      return { success: false, error: 'Failed to update company settings' }
    }
  }

  async resetToDefaults(): Promise<{ success: boolean; settings?: CompanySettings; error?: string }> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 150))

      const now = new Date().toISOString()
      await db.execute(
        `UPDATE company_settings SET 
         name = ?, description = ?, tax_enabled = ?, tax_percentage = ?, 
         currency_symbol = ?, language = ?, logo_url = ?, address = ?, 
         phone = ?, email = ?, website = ?, updated_at = ? 
         WHERE id = ?`,
        ['Post POS', 'Modern Point of Sale System', 1, 10.0, '$', 'en', null, null, null, null, null, now, 1],
      )

      const resetSettings = await db.select<DatabaseCompanySettings[]>(
        'SELECT * FROM company_settings WHERE id = 1 LIMIT 1',
      )

      return {
        success: true,
        settings: this.convertDbSettings(resetSettings[0]),
      }
    } catch (error) {
      console.error('Reset company settings error:', error)
      return { success: false, error: 'Failed to reset company settings' }
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  async getTaxRate(): Promise<number> {
    try {
      const settings = await this.getSettings()
      return settings.taxEnabled ? settings.taxPercentage / 100 : 0
    } catch (error) {
      console.error('Get tax rate error:', error)
      return 0.1 // Default 10% tax rate
    }
  }

  async calculateTax(amount: number): Promise<number> {
    const taxRate = await this.getTaxRate()
    return amount * taxRate
  }

  async calculateTotalWithTax(subtotal: number): Promise<{ tax: number; total: number }> {
    const tax = await this.calculateTax(subtotal)
    return {
      tax,
      total: subtotal + tax,
    }
  }
}

export const companySettingsService = CompanySettingsService.getInstance()
