import { execute, query } from '../lib/db-adapter'

export interface Category {
  id: string
  name: string
  image?: string
  parentId?: string | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface DatabaseCategory {
  id: number
  name: string
  image?: string
  parent_id: number | null
  sort_order: number
  is_active: number
  created_at: string
  updated_at: string
}

// Higher sort_order shows first (z-index style); ties fall back to name A-Z.
const CATEGORY_ORDER_BY = 'ORDER BY sort_order DESC, name COLLATE NOCASE ASC'

export class CategoryService {
  private static instance: CategoryService

  static getInstance(): CategoryService {
    if (!CategoryService.instance) {
      CategoryService.instance = new CategoryService()
    }
    return CategoryService.instance
  }

  private convertDbCategory(dbCategory: DatabaseCategory): Category {
    return {
      id: dbCategory.id.toString(),
      name: dbCategory.name,
      image: dbCategory.image || undefined,
      parentId: dbCategory.parent_id != null ? dbCategory.parent_id.toString() : null,
      sortOrder: dbCategory.sort_order ?? 0,
      isActive: Boolean(dbCategory.is_active),
      createdAt: dbCategory.created_at,
      updatedAt: dbCategory.updated_at,
    }
  }

  async getCategories(): Promise<Category[]> {
    try {
      const categories = await query<DatabaseCategory>(`SELECT * FROM categories ${CATEGORY_ORDER_BY}`)
      return categories.map((category) => this.convertDbCategory(category))
    } catch (error) {
      console.error('Get categories error:', error)
      throw new Error('Failed to fetch categories')
    }
  }

  async getActiveCategories(): Promise<Category[]> {
    try {
      const categories = await query<DatabaseCategory>(
        `SELECT * FROM categories WHERE is_active = 1 ${CATEGORY_ORDER_BY}`,
      )
      return categories.map((category) => this.convertDbCategory(category))
    } catch (error) {
      console.error('Get active categories error:', error)
      throw new Error('Failed to fetch active categories')
    }
  }

  async getCategoriesPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    categories: Category[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    try {
      const offset = (page - 1) * limit
      const countResult = await query<{ count: number }>('SELECT COUNT(*) as count FROM categories')
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      const categories = await query<DatabaseCategory>(
        `SELECT * FROM categories ${CATEGORY_ORDER_BY} LIMIT ? OFFSET ?`,
        [limit, offset],
      )

      return {
        categories: categories.map((category) => this.convertDbCategory(category)),
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Get paginated categories error:', error)
      throw new Error('Failed to fetch paginated categories')
    }
  }

  async getCategory(id: string): Promise<Category | null> {
    try {
      const categories = await query<DatabaseCategory>('SELECT * FROM categories WHERE id = ? LIMIT 1', [
        parseInt(id, 10),
      ])
      if (categories.length === 0) {
        return null
      }
      return this.convertDbCategory(categories[0])
    } catch (error) {
      console.error('Get category error:', error)
      throw new Error('Failed to fetch category')
    }
  }

  private async isNameInUse(name: string, excludeId?: string): Promise<boolean> {
    const excludeNumericId = excludeId ? parseInt(excludeId, 10) : null
    const conflicts = await query<{ id: number }>(
      `SELECT id FROM categories
       WHERE name = ? COLLATE NOCASE
         AND (? IS NULL OR id != ?)
       LIMIT 1`,
      [name, excludeNumericId, excludeNumericId],
    )
    return conflicts.length > 0
  }

  // All descendant category ids of `id` (used to prevent parent cycles).
  private async getDescendantIds(id: string): Promise<Set<string>> {
    const rows = await query<{ id: number; parent_id: number | null }>('SELECT id, parent_id FROM categories')
    const childrenByParent = new Map<string, string[]>()
    for (const row of rows) {
      const parent = row.parent_id != null ? row.parent_id.toString() : null
      if (parent) {
        const siblings = childrenByParent.get(parent) ?? []
        siblings.push(row.id.toString())
        childrenByParent.set(parent, siblings)
      }
    }
    const descendants = new Set<string>()
    const stack = [id]
    while (stack.length > 0) {
      const current = stack.pop() as string
      for (const child of childrenByParent.get(current) ?? []) {
        if (!descendants.has(child)) {
          descendants.add(child)
          stack.push(child)
        }
      }
    }
    return descendants
  }

  async createCategory(
    categoryData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<{ success: boolean; category?: Category; error?: string }> {
    const name = categoryData.name.trim()
    if (!name) {
      return { success: false, error: 'Category name is required' }
    }

    try {
      if (await this.isNameInUse(name)) {
        return { success: false, error: 'A category with this name already exists' }
      }

      const now = new Date().toISOString()
      const sortOrder = Number.isFinite(categoryData.sortOrder) ? Math.trunc(categoryData.sortOrder) : 0
      const parentId = categoryData.parentId ? parseInt(categoryData.parentId, 10) : null
      const result = await execute(
        `INSERT INTO categories (name, image, parent_id, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, categoryData.image || null, parentId, sortOrder, categoryData.isActive ? 1 : 0, now, now],
      )

      const newCategory: Category = {
        id: result.lastInsertId.toString(),
        name,
        image: categoryData.image,
        parentId: parentId != null ? parentId.toString() : null,
        sortOrder,
        isActive: categoryData.isActive,
        createdAt: now,
        updatedAt: now,
      }

      return { success: true, category: newCategory }
    } catch (error) {
      console.error('Create category error:', error)
      return { success: false, error: 'Failed to create category' }
    }
  }

  async updateCategory(
    id: string,
    updates: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<{ success: boolean; category?: Category; error?: string }> {
    if (updates.name !== undefined && !updates.name.trim()) {
      return { success: false, error: 'Category name is required' }
    }

    try {
      const existing = await this.getCategory(id)
      if (!existing) {
        return { success: false, error: 'Category not found' }
      }

      const nextName = updates.name !== undefined ? updates.name.trim() : existing.name
      if (nextName !== existing.name && (await this.isNameInUse(nextName, id))) {
        return { success: false, error: 'A category with this name already exists' }
      }

      let nextParentId = existing.parentId ?? null
      if (updates.parentId !== undefined) {
        nextParentId = updates.parentId || null
        if (nextParentId === id) {
          return { success: false, error: 'A category cannot be its own parent' }
        }
        if (nextParentId && (await this.getDescendantIds(id)).has(nextParentId)) {
          return { success: false, error: 'Cannot move a category under one of its own subcategories' }
        }
      }

      const fields: string[] = []
      const values: unknown[] = []

      if (updates.name !== undefined) {
        fields.push('name = ?')
        values.push(nextName)
      }
      if (updates.image !== undefined) {
        fields.push('image = ?')
        values.push(updates.image || null)
      }
      if (updates.parentId !== undefined) {
        fields.push('parent_id = ?')
        values.push(nextParentId ? parseInt(nextParentId, 10) : null)
      }
      if (updates.sortOrder !== undefined) {
        fields.push('sort_order = ?')
        values.push(Number.isFinite(updates.sortOrder) ? Math.trunc(updates.sortOrder) : 0)
      }
      if (updates.isActive !== undefined) {
        fields.push('is_active = ?')
        values.push(updates.isActive ? 1 : 0)
      }

      const now = new Date().toISOString()
      fields.push('updated_at = ?')
      values.push(now)
      values.push(parseInt(id, 10))

      await execute(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values)

      // Keep products in sync when a category is renamed (category is stored by name).
      if (nextName !== existing.name) {
        await execute('UPDATE products SET category = ?, updated_at = ? WHERE category = ?', [
          nextName,
          now,
          existing.name,
        ])
      }

      const updatedCategory: Category = {
        ...existing,
        name: nextName,
        image: updates.image !== undefined ? updates.image : existing.image,
        parentId: nextParentId,
        sortOrder:
          updates.sortOrder !== undefined && Number.isFinite(updates.sortOrder)
            ? Math.trunc(updates.sortOrder)
            : existing.sortOrder,
        isActive: updates.isActive !== undefined ? updates.isActive : existing.isActive,
        updatedAt: now,
      }

      return { success: true, category: updatedCategory }
    } catch (error) {
      console.error('Update category error:', error)
      return { success: false, error: 'Failed to update category' }
    }
  }

  async deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Promote any children to top-level so they are not orphaned.
      await execute('UPDATE categories SET parent_id = NULL, updated_at = ? WHERE parent_id = ?', [
        new Date().toISOString(),
        parseInt(id, 10),
      ])
      await execute('DELETE FROM categories WHERE id = ?', [parseInt(id, 10)])
      return { success: true }
    } catch (error) {
      console.error('Delete category error:', error)
      return { success: false, error: 'Failed to delete category' }
    }
  }

  async countProductsInCategory(name: string): Promise<number> {
    try {
      const result = await query<{ count: number }>('SELECT COUNT(*) as count FROM products WHERE category = ?', [name])
      return result[0]?.count || 0
    } catch (error) {
      console.error('Count products in category error:', error)
      return 0
    }
  }
}

export const categoryService = CategoryService.getInstance()
