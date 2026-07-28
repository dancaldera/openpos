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
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { type Product, productService } from '../services/products-turso'
import { type Promotion, promotionService } from '../services/promotions-turso'

interface EditPromotionModalProps {
  promotion: Promotion | null
  isOpen: boolean
  categories: string[]
  products: Product[]
  onClose: () => void
  onSave: () => void
}

interface PromotionFormData {
  name: string
  type: 'percentage' | 'nxm'
  percent: number
  buyN: number
  payM: number
  scopeType: 'all' | 'category' | 'product'
  categoryValue: string
  productIds: string[]
  combinable: boolean
  isActive: boolean
  priority: number
}

const EMPTY_FORM: PromotionFormData = {
  name: '',
  type: 'percentage',
  percent: 10,
  buyN: 3,
  payM: 2,
  scopeType: 'all',
  categoryValue: '',
  productIds: [],
  combinable: false,
  isActive: true,
  priority: 0,
}

function parseProductIds(scopeValue?: string | null): string[] {
  if (!scopeValue) {
    return []
  }
  try {
    const ids = JSON.parse(scopeValue)
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

function EditPromotionModal({ promotion, isOpen, categories, products, onClose, onSave }: EditPromotionModalProps) {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas p-6 '

  const [formData, setFormData] = useState<PromotionFormData>(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (promotion && isOpen) {
      setFormData({
        name: promotion.name,
        type: promotion.type,
        percent: promotion.percent ?? 10,
        buyN: promotion.buyN ?? 3,
        payM: promotion.payM ?? 2,
        scopeType: promotion.scopeType,
        categoryValue: promotion.scopeType === 'category' ? (promotion.scopeValue ?? '') : '',
        productIds: promotion.scopeType === 'product' ? parseProductIds(promotion.scopeValue) : [],
        combinable: promotion.combinable,
        isActive: promotion.isActive,
        priority: promotion.priority,
      })
    } else if (isOpen) {
      setFormData(EMPTY_FORM)
    }
    setError('')
  }, [promotion, isOpen])

  const toggleProduct = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(id)
        ? prev.productIds.filter((value) => value !== id)
        : [...prev.productIds, id],
    }))
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const scopeValue =
      formData.scopeType === 'category'
        ? formData.categoryValue
        : formData.scopeType === 'product'
          ? JSON.stringify(formData.productIds)
          : null

    const payload = {
      name: formData.name,
      type: formData.type,
      percent: formData.type === 'percentage' ? formData.percent : null,
      buyN: formData.type === 'nxm' ? formData.buyN : null,
      payM: formData.type === 'nxm' ? formData.payM : null,
      scopeType: formData.scopeType,
      scopeValue,
      combinable: formData.combinable,
      isActive: formData.isActive,
      priority: formData.priority,
      startDate: null,
      endDate: null,
    }

    try {
      const result = promotion
        ? await promotionService.updatePromotion(promotion.id, payload)
        : await promotionService.createPromotion(payload)

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
      title={promotion ? t('promotionManagement.editPromotion') : t('promotionManagement.addPromotion')}
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
            <Input
              label={t('promotionManagement.name')}
              value={formData.name}
              onInput={(e) => setFormData({ ...formData, name: (e.target as HTMLInputElement).value })}
              required
              class="bg-canvas text-void"
              placeholder={t('promotionManagement.name')}
            />

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Select
                label={t('promotionManagement.type')}
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: (e.target as HTMLSelectElement).value as 'percentage' | 'nxm' })
                }
                options={[
                  { value: 'percentage', label: t('promotionManagement.typePercentage') },
                  { value: 'nxm', label: t('promotionManagement.typeNxm') },
                ]}
                class="bg-canvas"
              />

              {formData.type === 'percentage' ? (
                <Input
                  label={t('promotionManagement.percent')}
                  type="number"
                  value={formData.percent.toString()}
                  onInput={(e) =>
                    setFormData({ ...formData, percent: parseFloat((e.target as HTMLInputElement).value) || 0 })
                  }
                  class="bg-canvas text-void"
                  placeholder="10"
                />
              ) : (
                <div class="grid grid-cols-2 gap-3">
                  <Input
                    label={t('promotionManagement.buyN')}
                    type="number"
                    value={formData.buyN.toString()}
                    onInput={(e) =>
                      setFormData({ ...formData, buyN: parseInt((e.target as HTMLInputElement).value, 10) || 0 })
                    }
                    class="bg-canvas text-void"
                    placeholder="3"
                  />
                  <Input
                    label={t('promotionManagement.payM')}
                    type="number"
                    value={formData.payM.toString()}
                    onInput={(e) =>
                      setFormData({ ...formData, payM: parseInt((e.target as HTMLInputElement).value, 10) || 0 })
                    }
                    class="bg-canvas text-void"
                    placeholder="2"
                  />
                </div>
              )}
            </div>

            <Select
              label={t('promotionManagement.scope')}
              value={formData.scopeType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  scopeType: (e.target as HTMLSelectElement).value as 'all' | 'category' | 'product',
                })
              }
              options={[
                { value: 'all', label: t('promotionManagement.scopeAll') },
                { value: 'category', label: t('promotionManagement.scopeCategory') },
                { value: 'product', label: t('promotionManagement.scopeProduct') },
              ]}
              class="bg-canvas"
            />

            {formData.scopeType === 'category' && (
              <Select
                label={t('promotionManagement.category')}
                value={formData.categoryValue}
                onChange={(e) => setFormData({ ...formData, categoryValue: (e.target as HTMLSelectElement).value })}
                placeholder={t('promotionManagement.selectCategory')}
                options={categories.map((category) => ({ value: category, label: category }))}
                class="bg-canvas"
              />
            )}

            {formData.scopeType === 'product' && (
              <div>
                <span class="mb-2 block text-sm font-medium text-void">{t('promotionManagement.products')}</span>
                <div class="max-h-40 overflow-y-auto rounded-cards border border-fog-border p-2">
                  {products.map((product) => (
                    <label key={product.id} class="flex items-center gap-2 px-2 py-1 text-sm text-void">
                      <input
                        type="checkbox"
                        checked={formData.productIds.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                      />
                      <span>{product.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Select
                label={t('common.status')}
                value={formData.isActive ? 'active' : 'inactive'}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: (e.target as HTMLSelectElement).value === 'active' })
                }
                options={[
                  { value: 'active', label: t('promotionManagement.active') },
                  { value: 'inactive', label: t('promotionManagement.inactive') },
                ]}
                class="bg-canvas"
              />
              <Input
                label={t('promotionManagement.priority')}
                type="number"
                value={formData.priority.toString()}
                onInput={(e) =>
                  setFormData({ ...formData, priority: parseInt((e.target as HTMLInputElement).value, 10) || 0 })
                }
                class="bg-canvas text-void"
                placeholder="0"
              />
            </div>

            <label class="flex items-center gap-2 text-sm text-void">
              <input
                type="checkbox"
                checked={formData.combinable}
                onChange={(e) => setFormData({ ...formData, combinable: (e.target as HTMLInputElement).checked })}
              />
              <span>{t('promotionManagement.combinable')}</span>
            </label>

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

function describeScope(promotion: Promotion, t: (key: string) => string): string {
  if (promotion.scopeType === 'all') {
    return t('promotionManagement.scopeAll')
  }
  if (promotion.scopeType === 'category') {
    return `${t('promotionManagement.scopeCategory')}: ${promotion.scopeValue ?? ''}`
  }
  return `${t('promotionManagement.scopeProduct')} (${parseProductIds(promotion.scopeValue).length})`
}

function describeType(promotion: Promotion): string {
  return promotion.type === 'percentage' ? `${promotion.percent ?? 0}%` : `${promotion.buyN}x${promotion.payM}`
}

export default function Promotions() {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '

  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(50)

  const { user: currentUser, hasRole, hasPermission } = useAuth()
  const canManage = currentUser && (hasRole('admin') || hasRole('manager') || hasPermission('products.view'))
  const canEdit = hasPermission('products.edit') || hasRole('admin') || hasRole('manager')
  const canCreate = hasPermission('products.create') || hasRole('admin') || hasRole('manager')
  const canDelete = hasPermission('products.delete') || hasRole('admin') || hasRole('manager')

  useEffect(() => {
    loadPromotions()
    void (async () => {
      try {
        setCategories(await productService.getCategories())
        setProducts(await productService.getProducts())
      } catch (err) {
        console.error('Failed to load promotion scope data:', err)
      }
    })()
  }, [])

  const loadPromotions = async (page: number = 1) => {
    if (!canManage) {
      setError(t('errors.unauthorized'))
      setIsLoading(false)
      return
    }
    try {
      setIsLoading(true)
      const result = await promotionService.getPromotionsPaginated(page, pageSize)
      setPromotions(result.promotions)
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

  const handleDelete = async (id: string) => {
    try {
      const result = await promotionService.deletePromotion(id)
      if (result.success) {
        setDeleteConfirm(null)
        await loadPromotions(currentPage)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  if (!canManage) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-sm">🔒</div>
            <h3 class="mb-3 text-2xl font-bold text-void ">{t('promotionManagement.accessDenied')}</h3>
            <p class="mx-auto max-w-md text-graphite ">{t('promotionManagement.noPermission')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && promotions.length === 0) {
    return <PageLoader message={t('promotionManagement.loading')} />
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <p class="text-sm text-graphite ">
          {totalCount} {t('promotionManagement.total')}
        </p>
        {canCreate && (
          <Button
            class="w-full sm:w-auto"
            onClick={() => {
              setEditing(null)
              setIsModalOpen(true)
            }}
          >
            {t('promotionManagement.addPromotion')}
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
              <TableHeader class="py-2 font-semibold">{t('promotionManagement.type')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('promotionManagement.scope')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('promotionManagement.combinable')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('common.status')}</TableHeader>
              <TableHeader class="py-2" />
            </TableRow>
          </TableHead>
          <TableBody>
            {promotions.map((promotion) => (
              <TableRow key={promotion.id}>
                <TableCell class="font-medium text-void">{promotion.name}</TableCell>
                <TableCell class="text-void">{describeType(promotion)}</TableCell>
                <TableCell class="text-void">{describeScope(promotion, t)}</TableCell>
                <TableCell class="text-void">{promotion.combinable ? t('common.yes') : t('common.no')}</TableCell>
                <TableCell>
                  <span class="inline-flex items-center rounded-chips border border-fog-border bg-chalk px-2 py-0.5 text-xs text-void">
                    {promotion.isActive ? t('promotionManagement.active') : t('promotionManagement.inactive')}
                  </span>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(promotion)
                          setIsModalOpen(true)
                        }}
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
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(promotion.id)}
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
          onPageChange={(page) => loadPromotions(page)}
          totalCount={totalCount}
          pageSize={pageSize}
          isLoading={isLoading}
        />
      )}

      {promotions.length === 0 && (
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6">🏷️</div>
            <h3 class="mb-3 text-2xl font-bold text-void ">{t('promotionManagement.noPromotions')}</h3>
            <p class="mx-auto mb-6 max-w-md text-graphite ">{t('promotionManagement.emptyCatalog')}</p>
            {canCreate && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setIsModalOpen(true)
                }}
                class="mt-4"
              >
                {t('promotionManagement.addFirst')}
              </Button>
            )}
          </div>
        </div>
      )}

      <EditPromotionModal
        promotion={editing}
        isOpen={isModalOpen}
        categories={categories}
        products={products}
        onClose={() => {
          setIsModalOpen(false)
          setEditing(null)
        }}
        onSave={() => loadPromotions(currentPage)}
      />

      <DialogConfirm
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title={t('promotionManagement.deleteConfirm')}
        message={t('promotionManagement.deleteMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />
    </div>
  )
}
