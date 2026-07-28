import { execute, query } from '../lib/db-adapter'
import type { PromotionScope, PromotionType } from '../lib/promotions'

export interface Promotion {
  id: string
  name: string
  type: PromotionType
  percent?: number | null
  buyN?: number | null
  payM?: number | null
  scopeType: PromotionScope
  scopeValue?: string | null
  combinable: boolean
  isActive: boolean
  priority: number
  startDate?: string | null
  endDate?: string | null
  createdAt: string
  updatedAt: string
}

interface DatabasePromotion {
  id: number
  name: string
  type: string
  percent: number | null
  buy_n: number | null
  pay_m: number | null
  scope_type: string
  scope_value: string | null
  combinable: number
  is_active: number
  priority: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

// Active promotions first by priority, then by name.
const PROMOTION_ORDER_BY = 'ORDER BY priority DESC, name COLLATE NOCASE ASC'

export class PromotionService {
  private static instance: PromotionService

  static getInstance(): PromotionService {
    if (!PromotionService.instance) {
      PromotionService.instance = new PromotionService()
    }
    return PromotionService.instance
  }

  private convertDbPromotion(row: DatabasePromotion): Promotion {
    return {
      id: row.id.toString(),
      name: row.name,
      type: row.type as PromotionType,
      percent: row.percent,
      buyN: row.buy_n,
      payM: row.pay_m,
      scopeType: row.scope_type as PromotionScope,
      scopeValue: row.scope_value,
      combinable: Boolean(row.combinable),
      isActive: Boolean(row.is_active),
      priority: row.priority,
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async getPromotions(): Promise<Promotion[]> {
    try {
      const rows = await query<DatabasePromotion>(`SELECT * FROM promotions ${PROMOTION_ORDER_BY}`)
      return rows.map((row) => this.convertDbPromotion(row))
    } catch (error) {
      console.error('Get promotions error:', error)
      throw new Error('Failed to fetch promotions')
    }
  }

  async getActivePromotions(): Promise<Promotion[]> {
    try {
      const rows = await query<DatabasePromotion>(`SELECT * FROM promotions WHERE is_active = 1 ${PROMOTION_ORDER_BY}`)
      return rows.map((row) => this.convertDbPromotion(row))
    } catch (error) {
      console.error('Get active promotions error:', error)
      // Promotions are optional; never block the cart/order if the table is missing.
      return []
    }
  }

  /**
   * Category name -> its ancestor category names (including itself), so a
   * promotion scoped to a parent category also applies to its subcategories.
   * Degrades to an empty map (exact-name match) when categories aren't present.
   */
  async getCategoryAncestorsByName(): Promise<Record<string, string[]>> {
    try {
      const rows = await query<{ id: number; name: string; parent_id: number | null }>(
        'SELECT id, name, parent_id FROM categories',
      )
      const byId = new Map<number, { name: string; parentId: number | null }>()
      for (const row of rows) {
        byId.set(row.id, { name: row.name, parentId: row.parent_id })
      }
      const result: Record<string, string[]> = {}
      for (const row of rows) {
        const chain: string[] = []
        const seen = new Set<number>()
        let current: number | null = row.id
        while (current != null && !seen.has(current)) {
          seen.add(current)
          const node = byId.get(current)
          if (!node) {
            break
          }
          chain.push(node.name)
          current = node.parentId
        }
        result[row.name] = chain
      }
      return result
    } catch {
      // Categories are optional; without them, category scope is an exact name match.
      return {}
    }
  }

  async getPromotionsPaginated(
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    promotions: Promotion[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    try {
      const offset = (page - 1) * limit
      const countResult = await query<{ count: number }>('SELECT COUNT(*) as count FROM promotions')
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)
      const rows = await query<DatabasePromotion>(`SELECT * FROM promotions ${PROMOTION_ORDER_BY} LIMIT ? OFFSET ?`, [
        limit,
        offset,
      ])
      return {
        promotions: rows.map((row) => this.convertDbPromotion(row)),
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Get paginated promotions error:', error)
      throw new Error('Failed to fetch paginated promotions')
    }
  }

  async getPromotion(id: string): Promise<Promotion | null> {
    try {
      const rows = await query<DatabasePromotion>('SELECT * FROM promotions WHERE id = ? LIMIT 1', [parseInt(id, 10)])
      return rows.length > 0 ? this.convertDbPromotion(rows[0]) : null
    } catch (error) {
      console.error('Get promotion error:', error)
      throw new Error('Failed to fetch promotion')
    }
  }

  private validate(data: Partial<Promotion>): string | null {
    if (data.name !== undefined && !data.name.trim()) {
      return 'Promotion name is required'
    }
    if (data.type === 'percentage' && (data.percent == null || data.percent <= 0 || data.percent > 100)) {
      return 'Percentage must be between 0 and 100'
    }
    if (data.type === 'nxm') {
      const buyN = data.buyN ?? 0
      const payM = data.payM ?? 0
      if (buyN <= 0 || payM < 0 || payM >= buyN) {
        return 'For NxM, buy must be greater than pay (e.g. 3x2)'
      }
    }
    if (data.scopeType === 'category' && !data.scopeValue) {
      return 'Select a category for a category-scoped promotion'
    }
    if (data.scopeType === 'product' && !data.scopeValue) {
      return 'Select at least one product for a product-scoped promotion'
    }
    return null
  }

  async createPromotion(
    data: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<{ success: boolean; promotion?: Promotion; error?: string }> {
    const validationError = this.validate(data)
    if (validationError) {
      return { success: false, error: validationError }
    }

    try {
      const now = new Date().toISOString()
      const result = await execute(
        `INSERT INTO promotions (
          name, type, percent, buy_n, pay_m, scope_type, scope_value,
          combinable, is_active, priority, start_date, end_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name.trim(),
          data.type,
          data.type === 'percentage' ? data.percent : null,
          data.type === 'nxm' ? data.buyN : null,
          data.type === 'nxm' ? data.payM : null,
          data.scopeType,
          data.scopeType === 'all' ? null : data.scopeValue || null,
          data.combinable ? 1 : 0,
          data.isActive ? 1 : 0,
          data.priority ?? 0,
          data.startDate || null,
          data.endDate || null,
          now,
          now,
        ],
      )

      const promotion = await this.getPromotion(result.lastInsertId.toString())
      return { success: true, promotion: promotion ?? undefined }
    } catch (error) {
      console.error('Create promotion error:', error)
      return { success: false, error: 'Failed to create promotion' }
    }
  }

  async updatePromotion(
    id: string,
    updates: Partial<Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<{ success: boolean; promotion?: Promotion; error?: string }> {
    const existing = await this.getPromotion(id)
    if (!existing) {
      return { success: false, error: 'Promotion not found' }
    }

    const merged = { ...existing, ...updates }
    const validationError = this.validate(merged)
    if (validationError) {
      return { success: false, error: validationError }
    }

    try {
      const fields: string[] = []
      const values: unknown[] = []
      const push = (column: string, value: unknown) => {
        fields.push(`${column} = ?`)
        values.push(value)
      }

      if (updates.name !== undefined) push('name', updates.name.trim())
      if (updates.type !== undefined) push('type', updates.type)
      // Normalize numeric fields against the effective type so they stay consistent.
      if (updates.type !== undefined || updates.percent !== undefined) {
        push('percent', merged.type === 'percentage' ? (merged.percent ?? null) : null)
      }
      if (updates.type !== undefined || updates.buyN !== undefined) {
        push('buy_n', merged.type === 'nxm' ? (merged.buyN ?? null) : null)
      }
      if (updates.type !== undefined || updates.payM !== undefined) {
        push('pay_m', merged.type === 'nxm' ? (merged.payM ?? null) : null)
      }
      if (updates.scopeType !== undefined) push('scope_type', updates.scopeType)
      if (updates.scopeType !== undefined || updates.scopeValue !== undefined) {
        push('scope_value', merged.scopeType === 'all' ? null : merged.scopeValue || null)
      }
      if (updates.combinable !== undefined) push('combinable', updates.combinable ? 1 : 0)
      if (updates.isActive !== undefined) push('is_active', updates.isActive ? 1 : 0)
      if (updates.priority !== undefined) push('priority', updates.priority)
      if (updates.startDate !== undefined) push('start_date', updates.startDate || null)
      if (updates.endDate !== undefined) push('end_date', updates.endDate || null)

      const now = new Date().toISOString()
      push('updated_at', now)
      values.push(parseInt(id, 10))

      await execute(`UPDATE promotions SET ${fields.join(', ')} WHERE id = ?`, values)

      const promotion = await this.getPromotion(id)
      return { success: true, promotion: promotion ?? undefined }
    } catch (error) {
      console.error('Update promotion error:', error)
      return { success: false, error: 'Failed to update promotion' }
    }
  }

  async deletePromotion(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execute('DELETE FROM promotions WHERE id = ?', [parseInt(id, 10)])
      return { success: true }
    } catch (error) {
      console.error('Delete promotion error:', error)
      return { success: false, error: 'Failed to delete promotion' }
    }
  }
}

export const promotionService = PromotionService.getInstance()
