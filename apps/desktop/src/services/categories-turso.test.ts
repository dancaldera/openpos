import { beforeEach, describe, expect, it, mock } from 'bun:test'

interface QueryCall {
  sql: string
  params: unknown[]
}

let queryImpl: (sql: string, params: unknown[]) => Promise<unknown[]>
const queryCalls: QueryCall[] = []
const executeCalls: QueryCall[] = []

const query = mock(async (sql: string, params: unknown[] = []) => {
  queryCalls.push({ sql, params })
  return queryImpl(sql, params)
})

const execute = mock(async (sql: string, params: unknown[] = []) => {
  executeCalls.push({ sql, params })
  return { lastInsertId: 42, rowsAffected: 1 }
})

mock.module('../lib/db-adapter', () => ({ query, execute }))

const { categoryService } = await import('./categories-turso')

const sampleRow = {
  id: 9,
  name: 'Bakery',
  image: null,
  sort_order: 5,
  is_active: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

describe('CategoryService', () => {
  beforeEach(() => {
    queryImpl = async () => []
    queryCalls.length = 0
    executeCalls.length = 0
    query.mockClear()
    execute.mockClear()
  })

  it('orders active categories by sort_order desc then name, and maps rows', async () => {
    queryImpl = async () => [sampleRow]

    const categories = await categoryService.getActiveCategories()

    expect(categories[0]).toEqual({
      id: '9',
      name: 'Bakery',
      image: undefined,
      parentId: null,
      sortOrder: 5,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })

    const listSql = queryCalls[0].sql
    expect(listSql).toContain('WHERE is_active = 1')
    expect(listSql).toContain('ORDER BY sort_order DESC, name COLLATE NOCASE ASC')
  })

  it('rejects a category with an empty name', async () => {
    const result = await categoryService.createCategory({ name: '   ', sortOrder: 0, isActive: true })

    expect(result.success).toBe(false)
    expect(executeCalls).toHaveLength(0)
  })

  it('rejects a duplicate category name', async () => {
    queryImpl = async (sql) => (sql.includes('SELECT id FROM categories') ? [{ id: 1 }] : [])

    const result = await categoryService.createCategory({ name: 'Bakery', sortOrder: 0, isActive: true })

    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
    expect(executeCalls).toHaveLength(0)
  })

  it('inserts sort_order when creating a category', async () => {
    const result = await categoryService.createCategory({ name: 'New Category', sortOrder: 7, isActive: true })

    expect(result.success).toBe(true)
    expect(result.category?.sortOrder).toBe(7)

    const insert = executeCalls.find((call) => call.sql.includes('INSERT INTO categories'))
    expect(insert).toBeDefined()
    expect(insert?.sql).toContain('sort_order')
    expect(insert?.params).toContain(7)
  })

  it('cascades a rename to products and updates sort_order', async () => {
    queryImpl = async (sql) => {
      if (sql.includes('SELECT id FROM categories')) return []
      if (sql.includes('SELECT * FROM categories WHERE id')) return [sampleRow]
      return []
    }

    const result = await categoryService.updateCategory('9', { name: 'Fresh Bakery', sortOrder: 3, isActive: true })

    expect(result.success).toBe(true)
    expect(result.category?.name).toBe('Fresh Bakery')
    expect(result.category?.sortOrder).toBe(3)

    const categoryUpdate = executeCalls.find((call) => call.sql.includes('UPDATE categories SET'))
    expect(categoryUpdate?.sql).toContain('sort_order = ?')

    const productCascade = executeCalls.find((call) => call.sql.includes('UPDATE products SET category'))
    expect(productCascade).toBeDefined()
    expect(productCascade?.params).toContain('Fresh Bakery')
    expect(productCascade?.params).toContain('Bakery')
  })

  it('does not cascade to products when the name is unchanged', async () => {
    queryImpl = async (sql) => {
      if (sql.includes('SELECT id FROM categories')) return []
      if (sql.includes('SELECT * FROM categories WHERE id')) return [sampleRow]
      return []
    }

    await categoryService.updateCategory('9', { sortOrder: 12 })

    const productCascade = executeCalls.find((call) => call.sql.includes('UPDATE products SET category'))
    expect(productCascade).toBeUndefined()
  })

  it('stores parent_id when creating a subcategory', async () => {
    const result = await categoryService.createCategory({ name: 'Cola', parentId: '9', sortOrder: 0, isActive: true })

    expect(result.success).toBe(true)
    expect(result.category?.parentId).toBe('9')
    const insert = executeCalls.find((call) => call.sql.includes('INSERT INTO categories'))
    expect(insert?.sql).toContain('parent_id')
    expect(insert?.params).toContain(9)
  })

  it('rejects making a category its own parent', async () => {
    queryImpl = async (sql) => (sql.includes('SELECT * FROM categories WHERE id') ? [sampleRow] : [])

    const result = await categoryService.updateCategory('9', { parentId: '9' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('own parent')
  })

  it('rejects moving a category under one of its descendants', async () => {
    queryImpl = async (sql) => {
      if (sql.includes('SELECT * FROM categories WHERE id')) return [sampleRow]
      if (sql.includes('SELECT id, parent_id FROM categories')) {
        return [
          { id: 9, parent_id: null },
          { id: 20, parent_id: 9 },
        ]
      }
      return []
    }

    const result = await categoryService.updateCategory('9', { parentId: '20' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('subcategor')
  })

  it('reparents children to top level before deleting a category', async () => {
    await categoryService.deleteCategory('9')

    const reparent = executeCalls.find((call) => call.sql.includes('SET parent_id = NULL'))
    expect(reparent?.params).toContain(9)
    const del = executeCalls.find((call) => call.sql.startsWith('DELETE FROM categories'))
    expect(del).toBeDefined()
  })
})
