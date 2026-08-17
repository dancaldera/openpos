import { useEffect, useState } from 'preact/hooks'
import {
  Button,
  Dialog,
  DialogConfirm,
  Input,
  PageLoader,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'
import { EmojiPicker } from '../components/ui/EmojiPicker'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { getCategoryIcon } from '../lib/category-icons'
import { fileToCompressedDataUrl } from '../lib/image-encode'
import { type Category, categoryService } from '../services/categories-turso'

interface EditCategoryModalProps {
  category: Category | null
  isOpen: boolean
  categories: Category[]
  onClose: () => void
  onSave: () => void
}

// Descendant ids of `id` in a flat category list (to exclude invalid parents).
function collectDescendantIds(id: string, categories: Category[]): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const category of categories) {
    if (category.parentId) {
      const siblings = childrenByParent.get(category.parentId) ?? []
      siblings.push(category.id)
      childrenByParent.set(category.parentId, siblings)
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

// A category image is either an uploaded base64 data URL or a chosen emoji.
function isDataUrlImage(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith('data:')
}
function EditCategoryModal({ category, isOpen, categories, onClose, onSave }: EditCategoryModalProps) {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas p-6 '

  const [formData, setFormData] = useState({ name: '', image: '', parentId: '', sortOrder: 0, isActive: true })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  useEffect(() => {
    if (category && isOpen) {
      setFormData({
        name: category.name,
        image: category.image || '',
        parentId: category.parentId ?? '',
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      })
    } else if (isOpen) {
      setFormData({ name: '', image: '', parentId: '', sortOrder: 0, isActive: true })
    }
    setShowEmojiPicker(false)
    setError('')
  }, [category, isOpen])

  const excludedParentIds = category ? collectDescendantIds(category.id, categories) : new Set<string>()
  const parentOptions = [
    { value: '', label: t('categoryManagement.noParent') },
    ...categories
      .filter((option) => option.id !== category?.id && !excludedParentIds.has(option.id))
      .map((option) => ({ value: option.id, label: option.name })),
  ]

  const handleImageSelection = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      return
    }
    try {
      const dataUrl = await fileToCompressedDataUrl(file)
      setFormData((prev) => ({ ...prev, image: dataUrl }))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      input.value = ''
    }
  }

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, image: '' }))
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const result = category
        ? await categoryService.updateCategory(category.id, {
            name: formData.name,
            image: formData.image || undefined,
            parentId: formData.parentId || null,
            sortOrder: formData.sortOrder,
            isActive: formData.isActive,
          })
        : await categoryService.createCategory({
            name: formData.name,
            image: formData.image || undefined,
            parentId: formData.parentId || null,
            sortOrder: formData.sortOrder,
            isActive: formData.isActive,
          })

      if (result.success) {
        onSave()
        onClose()
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={category ? t('categoryManagement.editCategory') : t('categoryManagement.addCategory')}
      size="md"
    >
      <div>
        {error && (
          <div class="mb-6 rounded-cards border border-fog-border bg-chalk px-4 py-3 text-void ">
            <div class="flex items-center">
              <span class="text-void mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        <div class={panelClass}>
          <form onSubmit={handleSubmit} class="space-y-6">
            <div>
              <Input
                label={t('categoryManagement.categoryName')}
                value={formData.name}
                onInput={(e) => setFormData({ ...formData, name: (e.target as HTMLInputElement).value })}
                required
                class="bg-canvas text-void"
                placeholder={t('categoryManagement.categoryName')}
              />
            </div>

            <div>
              <span class="mb-2 block text-sm font-medium text-void">{t('categoryManagement.categoryImage')}</span>
              <div class="flex items-start gap-4">
                <div class="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((value) => !value)}
                    aria-label={t('categoryManagement.orChooseEmoji')}
                    class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-cards border border-fog-border bg-chalk transition-colors hover:border-void"
                  >
                    {formData.image ? (
                      isDataUrlImage(formData.image) ? (
                        <img src={formData.image} alt={formData.name} class="h-full w-full object-cover" />
                      ) : (
                        <span class="text-4xl">{formData.image}</span>
                      )
                    ) : (
                      <span class="text-2xl">{getCategoryIcon(formData.name)}</span>
                    )}
                  </button>
                  {showEmojiPicker && (
                    <div class="absolute left-0 z-20 mt-2">
                      <EmojiPicker
                        value={isDataUrlImage(formData.image) ? undefined : formData.image}
                        onSelect={(emoji) => {
                          setFormData((prev) => ({ ...prev, image: emoji }))
                          setShowEmojiPicker(false)
                        }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <p class="mt-1 text-xs text-graphite ">{t('categoryManagement.clickIconForEmoji')}</p>
                  <div class="mt-3 flex items-center gap-2">
                    <label class="inline-flex cursor-pointer items-center rounded-cards border border-fog-border bg-chalk px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-chalk ">
                      <span>
                        {formData.image ? t('categoryManagement.changeImage') : t('categoryManagement.uploadImage')}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        class="sr-only"
                        onChange={handleImageSelection}
                        disabled={isLoading}
                      />
                    </label>
                    {formData.image && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleRemoveImage}
                        disabled={isLoading}
                      >
                        {t('categoryManagement.removeImage')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Select
                label={t('categoryManagement.parent')}
                value={formData.parentId}
                onChange={(e) => setFormData({ ...formData, parentId: (e.target as HTMLSelectElement).value })}
                options={parentOptions}
                class="bg-canvas"
              />
              <p class="mt-1 text-xs text-graphite ">{t('categoryManagement.parentHelp')}</p>
            </div>

            <div>
              <Input
                label={t('categoryManagement.order')}
                type="number"
                value={formData.sortOrder.toString()}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    sortOrder: parseInt((e.target as HTMLInputElement).value, 10) || 0,
                  })
                }
                class="bg-canvas text-void"
                placeholder="0"
              />
              <p class="mt-1 text-xs text-graphite ">{t('categoryManagement.orderHelp')}</p>
            </div>

            <div>
              <Select
                label={t('common.status')}
                value={formData.isActive ? 'active' : 'inactive'}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: (e.target as HTMLSelectElement).value === 'active' })
                }
                options={[
                  { value: 'active', label: t('categoryManagement.active') },
                  { value: 'inactive', label: t('categoryManagement.inactive') },
                ]}
                class="bg-canvas"
              />
            </div>

            <div class="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  )
}

// Flatten categories into the currently-visible depth-first list (collapsed
// nodes hide their descendants), with nesting depth and whether the node has
// children, so the table can render a collapsible tree.
function buildCategoryTree(
  categories: Category[],
  collapsed: Set<string>,
): { category: Category; depth: number; hasChildren: boolean }[] {
  const ids = new Set(categories.map((category) => category.id))
  const childrenByParent = new Map<string | null, Category[]>()
  for (const category of categories) {
    const key = category.parentId && ids.has(category.parentId) ? category.parentId : null
    const siblings = childrenByParent.get(key) ?? []
    siblings.push(category)
    childrenByParent.set(key, siblings)
  }
  const result: { category: Category; depth: number; hasChildren: boolean }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const category of childrenByParent.get(parent) ?? []) {
      const hasChildren = (childrenByParent.get(category.id)?.length ?? 0) > 0
      result.push({ category, depth, hasChildren })
      if (hasChildren && !collapsed.has(category.id)) {
        walk(category.id, depth + 1)
      }
    }
  }
  walk(null, 0)
  return result
}

export default function Categories() {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '

  const [categories, setCategories] = useState<Category[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(50)

  const { user: currentUser, hasRole, hasPermission } = useAuth()

  const canManageCategories = currentUser && (hasRole('admin') || hasRole('manager') || hasPermission('products.view'))
  const canEditCategories = hasPermission('products.edit') || hasRole('admin') || hasRole('manager')
  const canCreateCategories = hasPermission('products.create') || hasRole('admin') || hasRole('manager')
  const canDeleteCategories = hasPermission('products.delete') || hasRole('admin') || hasRole('manager')

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async (page: number = 1) => {
    if (!canManageCategories) {
      setError(t('errors.unauthorized'))
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const result = await categoryService.getCategoriesPaginated(page, pageSize)
      setCategories(result.categories)
      setAllCategories(await categoryService.getCategories())
      setTotalCount(result.totalCount)
      setTotalPages(result.totalPages)
      setCurrentPage(result.currentPage)
      setError('')
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    loadCategories(page)
  }

  const handleCreateCategory = () => {
    setEditingCategory(null)
    setIsModalOpen(true)
  }

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category)
    setIsModalOpen(true)
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      const result = await categoryService.deleteCategory(id)
      if (result.success) {
        setDeleteConfirm(null)
        await loadCategories(currentPage)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const handleSetIcon = async (id: string, emoji: string) => {
    setEmojiPickerFor(null)
    try {
      const result = await categoryService.updateCategory(id, { image: emoji })
      if (result.success) {
        await loadCategories(currentPage)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const handleSaveCategory = async () => {
    await loadCategories(currentPage)
  }

  if (!canManageCategories) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-sm">🔒</div>
            <h3 class="mb-3 text-2xl font-bold text-void ">{t('categoryManagement.accessDenied')}</h3>
            <p class="mx-auto max-w-md text-graphite ">{t('categoryManagement.noPermission')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && categories.length === 0) {
    return <PageLoader message={t('categoryManagement.loading')} />
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <p class="text-sm text-graphite ">
          {totalCount} {t('categoryManagement.total')}
          {totalPages > 1 && ` • ${t('products.pageXofY', { current: currentPage, total: totalPages })}`}
        </p>
        {canCreateCategories && (
          <Button class="w-full sm:w-auto" onClick={handleCreateCategory}>
            {t('categoryManagement.addCategory')}
          </Button>
        )}
      </div>

      {error && (
        <div class="mb-6 rounded-cards border border-fog-border bg-chalk px-4 py-3 text-void ">
          <div class="flex items-center">
            <span class="text-void mr-2">⚠️</span>
            {error}
          </div>
        </div>
      )}

      <div class={`${panelClass} overflow-hidden`}>
        <Table dense striped>
          <TableHead>
            <TableRow class="bg-chalk ">
              <TableHeader class="py-2 font-semibold">{t('common.name')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('categoryManagement.order')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('common.status')}</TableHeader>
              <TableHeader class="py-2" />
            </TableRow>
          </TableHead>
          <TableBody>
            {buildCategoryTree(allCategories, collapsed).map(({ category, depth, hasChildren }) => (
              <TableRow key={category.id}>
                <TableCell class="font-medium text-void">
                  <div class="flex items-center gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapse(category.id)}
                        aria-label={collapsed.has(category.id) ? t('common.expand') : t('common.collapse')}
                        class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-graphite transition-colors hover:bg-chalk hover:text-void"
                      >
                        <svg
                          class={`h-4 w-4 transition-transform ${collapsed.has(category.id) ? '' : 'rotate-90'}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    ) : (
                      <span class="h-5 w-5 shrink-0" aria-hidden="true" />
                    )}
                    <div class="relative shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          canEditCategories && setEmojiPickerFor((prev) => (prev === category.id ? null : category.id))
                        }
                        disabled={!canEditCategories}
                        aria-label={t('common.edit')}
                        class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-cards border border-fog-border bg-chalk transition-colors enabled:hover:border-void"
                      >
                        {category.image ? (
                          isDataUrlImage(category.image) ? (
                            <img src={category.image} alt={category.name} class="h-full w-full object-cover" />
                          ) : (
                            <span class="text-lg">{category.image}</span>
                          )
                        ) : (
                          <span class="text-base">{getCategoryIcon(category.name)}</span>
                        )}
                      </button>
                      {emojiPickerFor === category.id && (
                        <div class="absolute left-0 top-full z-30 mt-1">
                          <EmojiPicker
                            value={isDataUrlImage(category.image) ? undefined : category.image}
                            onSelect={(emoji) => handleSetIcon(category.id, emoji)}
                          />
                        </div>
                      )}
                    </div>
                    <span>{category.name}</span>
                  </div>
                </TableCell>
                <TableCell class="text-void">{category.sortOrder}</TableCell>
                <TableCell>
                  <span class="inline-flex items-center rounded-chips border border-fog-border bg-chalk px-2 py-0.5 text-xs text-void">
                    {category.isActive ? t('categoryManagement.active') : t('categoryManagement.inactive')}
                  </span>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    {canEditCategories && (
                      <button
                        type="button"
                        onClick={() => handleEditCategory(category)}
                        aria-label={t('common.edit')}
                        class="rounded-buttons p-2 text-graphite transition-colors hover:bg-chalk hover:text-void"
                      >
                        <svg
                          class="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.8"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                    {canDeleteCategories && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(category.id)}
                        aria-label={t('common.delete')}
                        class="rounded-buttons p-2 text-graphite transition-colors hover:bg-chalk hover:text-void"
                      >
                        <svg
                          class="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.8"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          totalCount={totalCount}
          pageSize={pageSize}
          isLoading={isLoading}
        />
      )}

      {categories.length === 0 && (
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6">🏷️</div>
            <h3 class="mb-3 text-2xl font-bold text-void ">{t('categoryManagement.noCategories')}</h3>
            <p class="mx-auto mb-6 max-w-md text-graphite ">{t('categoryManagement.emptyCatalog')}</p>
            {canCreateCategories && (
              <Button onClick={handleCreateCategory} class="mt-4">
                {t('categoryManagement.addFirst')}
              </Button>
            )}
          </div>
        </div>
      )}

      <EditCategoryModal
        category={editingCategory}
        isOpen={isModalOpen}
        categories={allCategories}
        onClose={() => {
          setIsModalOpen(false)
          setEditingCategory(null)
        }}
        onSave={handleSaveCategory}
      />

      <DialogConfirm
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteCategory(deleteConfirm)}
        title={t('categoryManagement.deleteConfirm')}
        message={t('categoryManagement.deleteMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />
    </div>
  )
}
