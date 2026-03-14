import { useEffect, useState } from 'preact/hooks'
import {
  Button,
  Dialog,
  DialogConfirm,
  Input,
  Select,
  Textarea,
} from './ui'
import { useTranslation } from '../hooks/useTranslation'
import {
  productVariantsService,
  type ProductVariant,
  type ProductVariantInput,
  type ProductAttribute,
} from '../services/product-variants-sqlite'

interface ProductVariantRowProps {
  variant: ProductVariant
  onEdit: (variant: ProductVariant) => void
  onDelete: (variantId: string) => void
}

export function ProductVariantRow({ variant, onEdit, onDelete }: ProductVariantRowProps) {
  const { t } = useTranslation()

  const getStockColor = (stock: number) => {
    if (stock === 0) return 'from-red-100 to-red-200 text-red-800 border-red-300'
    if (stock < 10) return 'from-yellow-100 to-yellow-200 text-yellow-800 border-yellow-300'
    return 'from-green-100 to-green-200 text-green-800 border-green-300'
  }

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`

  return (
    <div class="grid grid-cols-12 gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all">
      {/* Attributes */}
      <div class="col-span-4">
        <div class="text-xs text-gray-500 mb-1">{t('variants.attributes')}</div>
        <div class="flex flex-wrap gap-1">
          {Object.entries(variant.attributes).map(([key, value]) => (
            <span
              key={key}
              class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200"
            >
              <span class="capitalize">{key}:</span> {value}
            </span>
          ))}
        </div>
      </div>

      {/* SKU */}
      <div class="col-span-2">
        <div class="text-xs text-gray-500 mb-1">{t('variants.sku')}</div>
        <div class="text-sm font-mono text-gray-900">{variant.sku || '-'}</div>
      </div>

      {/* Price */}
      <div class="col-span-2">
        <div class="text-xs text-gray-500 mb-1">{t('variants.variantPrice')}</div>
        <div class="text-sm font-bold text-emerald-600">{formatCurrency(variant.price)}</div>
      </div>

      {/* Stock */}
      <div class="col-span-2">
        <div class="text-xs text-gray-500 mb-1">{t('variants.variantStock')}</div>
        <div
          class={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${getStockColor(variant.stock)} border shadow-sm`}
        >
          {variant.stock}
        </div>
      </div>

      {/* Actions */}
      <div class="col-span-2 flex items-end gap-2">
        <Button size="sm" variant="outline" onClick={() => onEdit(variant)} class="text-xs">
          ✏️
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDelete(variant.id)}
          class="text-xs text-red-600 border-red-200 hover:bg-red-50"
        >
          🗑️
        </Button>
      </div>
    </div>
  )
}

interface EditVariantModalProps {
  variant: ProductVariant | null
  productId: string
  isOpen: boolean
  onClose: () => void
  onSave: (variant: ProductVariant) => void
}

export function EditVariantModal({ variant, productId, isOpen, onClose, onSave }: EditVariantModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<ProductVariantInput>({
    parentProductId: productId,
    price: 0,
    cost: 0,
    stock: 0,
    attributes: {},
    isActive: true,
    position: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (variant && isOpen) {
      setFormData({
        parentProductId: variant.parentProductId,
        sku: variant.sku,
        barcode: variant.barcode,
        price: variant.price,
        cost: variant.cost,
        stock: variant.stock,
        attributes: variant.attributes,
        image: variant.image,
        isActive: variant.isActive,
        position: variant.position,
      })
    } else if (isOpen) {
      setFormData({
        parentProductId: productId,
        price: 0,
        cost: 0,
        stock: 0,
        attributes: {},
        isActive: true,
        position: 0,
      })
    }
    setError('')
  }, [variant, isOpen, productId])

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      let result
      if (variant) {
        result = await productVariantsService.updateVariant(variant.id, formData)
      } else {
        result = await productVariantsService.createVariant(formData)
      }

      if (result.success && result.variant) {
        onSave(result.variant)
        onClose()
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={variant ? t('variants.editVariant') : t('variants.addVariant')} size="md">
      <div>
        {error && (
          <div class="bg-red-500/10 backdrop-blur-sm border border-red-400/20 text-red-700 px-4 py-3 rounded-xl mb-6">
            <div class="flex items-center">
              <span class="text-red-500 mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} class="space-y-6">
          {/* SKU & Barcode */}
          <div class="grid grid-cols-2 gap-6">
            <div>
              <Input
                label={t('variants.sku')}
                value={formData.sku || ''}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    sku: (e.target as HTMLInputElement).value,
                  })
                }
                class="bg-white/80 text-gray-900"
                placeholder="SKU-001"
              />
            </div>
            <div>
              <Input
                label={t('variants.barcode')}
                value={formData.barcode || ''}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    barcode: (e.target as HTMLInputElement).value,
                  })
                }
                class="bg-white/80 text-gray-900"
                placeholder="1234567890"
              />
            </div>
          </div>

          {/* Price, Cost, Stock */}
          <div class="grid grid-cols-3 gap-4">
            <div>
              <Input
                label={`💰 ${t('variants.variantPrice')}`}
                type="number"
                value={formData.price.toString()}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    price: parseFloat((e.target as HTMLInputElement).value) || 0,
                  })
                }
                required
                class="bg-white/80 text-gray-900"
                placeholder="0.00"
              />
            </div>
            <div>
              <Input
                label={`🏭 ${t('common.cost')}`}
                type="number"
                value={formData.cost.toString()}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    cost: parseFloat((e.target as HTMLInputElement).value) || 0,
                  })
                }
                required
                class="bg-white/80 text-gray-900"
                placeholder="0.00"
              />
            </div>
            <div>
              <Input
                label={`📊 ${t('variants.variantStock')}`}
                type="number"
                value={formData.stock.toString()}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    stock: parseInt((e.target as HTMLInputElement).value, 10) || 0,
                  })
                }
                required
                class="bg-white/80 text-gray-900"
                placeholder="0"
              />
            </div>
          </div>

          {/* Profit Margin */}
          {formData.price > 0 && formData.cost > 0 && (
            <div class="backdrop-blur-md bg-emerald-100/60 rounded-xl p-4 border border-emerald-200/50 shadow-md">
              <div class="flex justify-between items-center">
                <span class="font-semibold text-emerald-800">{t('products.profitMarginLabel')}</span>
                <span class="text-xl font-bold text-emerald-600">
                  {(((formData.price - formData.cost) / formData.cost) * 100).toFixed(1)}%
                </span>
              </div>
              <div class="text-sm text-emerald-700 mt-1">
                {t('products.profitPerUnit', { amount: formatCurrency(formData.price - formData.cost) })}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <Select
              label={`✅ ${t('products.status')}`}
              value={formData.isActive ? 'active' : 'inactive'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  isActive: (e.target as HTMLSelectElement).value === 'active',
                })
              }
              options={[
                {
                  value: 'active',
                  label: `✅ ${t('products.activeStatus')}`,
                },
                {
                  value: 'inactive',
                  label: `⛔ ${t('products.inactiveStatus')}`,
                },
              ]}
              class="bg-white/80"
            />
          </div>
        </form>
      </div>

      <div class="flex justify-end gap-3 pt-6 border-t border-gray-200">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={() => handleSubmit(new Event('submit'))} disabled={isLoading}>
          {isLoading ? t('common.loading') : variant ? t('common.save') : t('common.add')}
        </Button>
      </div>
    </Dialog>
  )
}

interface VariantGeneratorProps {
  productId: string
  isOpen: boolean
  onClose: () => void
  onGenerated: (variants: ProductVariant[]) => void
}

export function VariantGenerator({ productId, isOpen, onClose, onGenerated }: VariantGeneratorProps) {
  const { t } = useTranslation()
  const [attributes, setAttributes] = useState<ProductAttribute[]>([])
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string[]>>({})
  const [basePrice, setBasePrice] = useState(0)
  const [baseCost, setBaseCost] = useState(0)
  const [baseStock, setBaseStock] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(1)

  const totalCombinations = Object.values(selectedAttributes).reduce(
    (acc, values) => (values.length > 0 ? acc * values.length : acc),
    1,
  )

  useEffect(() => {
    if (isOpen) {
      loadAttributes()
    }
  }, [isOpen])

  const loadAttributes = async () => {
    setIsLoading(true)
    try {
      const attrs = await productVariantsService.getAttributes()
      setAttributes(attrs)
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const toggleAttributeValue = (attributeId: string, value: string) => {
    setSelectedAttributes((prev) => {
      const currentValues = prev[attributeId] || []
      if (currentValues.includes(value)) {
        const newValues = currentValues.filter((v) => v !== value)
        if (newValues.length === 0) {
          const { [attributeId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [attributeId]: newValues }
      }
      return { ...prev, [attributeId]: [...currentValues, value] }
    })
  }

  const handleGenerate = async () => {
    if (Object.keys(selectedAttributes).length === 0) {
      setError(t('variants.addAttributeFirst'))
      return
    }

    setIsGenerating(true)
    setError('')

    try {
      const result = await productVariantsService.generateVariants(productId, selectedAttributes, {
        price: basePrice,
        cost: baseCost,
        stock: baseStock,
      })

      if (result.success && result.variants) {
        onGenerated(result.variants)
        onClose()
        // Reset form
        setSelectedAttributes({})
        setBasePrice(0)
        setBaseCost(0)
        setBaseStock(0)
        setCurrentStep(1)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) {
    return (
      <Dialog isOpen={isOpen} onClose={onClose} title={t('variants.variantGenerator')} size="lg">
        <div class="flex justify-center py-8">
          <div class="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-spin border-4 border-transparent border-t-white"></div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={t('variants.variantGenerator')} size="lg">
      <div>
        {error && (
          <div class="bg-red-500/10 backdrop-blur-sm border border-red-400/20 text-red-700 px-4 py-3 rounded-xl mb-6">
            <div class="flex items-center">
              <span class="text-red-500 mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div class="flex items-center justify-center mb-8">
          <div class="flex items-center">
            <div
              class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                currentStep >= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              1
            </div>
            <div class={`w-16 h-1 ${currentStep >= 2 ? 'bg-indigo-600' : 'bg-gray-200'}`}></div>
            <div
              class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                currentStep >= 2 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              2
            </div>
          </div>
        </div>

        {currentStep === 1 && (
          <div class="space-y-6">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-4">{t('variants.selectAttributes')}</h3>
              {attributes.length === 0 ? (
                <div class="text-center py-8 bg-gray-50 rounded-xl">
                  <div class="text-4xl mb-2">🏷️</div>
                  <p class="text-gray-600">{t('variants.noAttributesAvailable')}</p>
                </div>
              ) : (
                <div class="space-y-4">
                  {attributes.map((attr) => (
                    <div key={attr.id} class="bg-gray-50 rounded-xl p-4">
                      <div class="flex items-center justify-between mb-3">
                        <h4 class="font-semibold text-gray-900">{attr.name}</h4>
                        <span class="text-sm text-gray-500">{attr.slug}</span>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        {attr.values.map((value) => {
                          const isSelected = selectedAttributes[attr.id]?.includes(value)
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => toggleAttributeValue(attr.id, value)}
                              class={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-md'
                                  : 'bg-white text-gray-700 border border-gray-200 hover:border-indigo-300'
                              }`}
                            >
                              {value}
                            </button>
                          )
                        })}
                      </div>
                      {selectedAttributes[attr.id] && selectedAttributes[attr.id].length > 0 && (
                        <div class="mt-2 text-sm text-indigo-600">
                          {t('variants.selectValues')}: {selectedAttributes[attr.id].join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {totalCombinations > 0 && (
              <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <div class="flex items-center justify-between">
                  <span class="text-indigo-900 font-semibold">{t('variants.variantsGenerated')}</span>
                  <span class="text-2xl font-bold text-indigo-600">{totalCombinations}</span>
                </div>
              </div>
            )}

            <div class="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => setCurrentStep(2)}
                disabled={Object.keys(selectedAttributes).length === 0}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div class="space-y-6">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-4">
                {t('variants.title')} - {t('common.details')}
              </h3>

              <div class="bg-gray-50 rounded-xl p-4 mb-4">
                <p class="text-sm text-gray-600">
                  {t('variants.variantsGenerated')}: <span class="font-bold">{totalCombinations}</span>
                </p>
                <div class="mt-2 text-xs text-gray-500">
                  {Object.entries(selectedAttributes).map(([attrId, values]) => {
                    const attr = attributes.find((a) => a.id === attrId)
                    return (
                      <div key={attrId}>
                        {attr?.name}: {values.join(', ')}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div class="grid grid-cols-3 gap-4">
                <div>
                  <Input
                    label={`💰 ${t('variants.variantPrice')}`}
                    type="number"
                    value={basePrice.toString()}
                    onInput={(e) => setBasePrice(parseFloat((e.target as HTMLInputElement).value) || 0)}
                    required
                    class="bg-white/80 text-gray-900"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Input
                    label={`🏭 ${t('common.cost')}`}
                    type="number"
                    value={baseCost.toString()}
                    onInput={(e) => setBaseCost(parseFloat((e.target as HTMLInputElement).value) || 0)}
                    required
                    class="bg-white/80 text-gray-900"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Input
                    label={`📊 ${t('variants.variantStock')}`}
                    type="number"
                    value={baseStock.toString()}
                    onInput={(e) => setBaseStock(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
                    required
                    class="bg-white/80 text-gray-900"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div class="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCurrentStep(1)} disabled={isGenerating}>
                {t('common.previous')}
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating || basePrice <= 0}>
                {isGenerating ? t('variants.generatingVariants') : t('variants.generateVariants')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

interface VariantSettingsModalProps {
  productId: string
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

export function VariantSettingsModal({ productId, isOpen, onClose, onSaved }: VariantSettingsModalProps) {
  const { t } = useTranslation()
  const [attributes, setAttributes] = useState<ProductAttribute[]>([])
  const [selectedAttributeIds, setSelectedAttributeIds] = useState<string[]>([])
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadAttributes()
    }
  }, [isOpen])

  const loadAttributes = async () => {
    try {
      const attrs = await productVariantsService.getAttributes()
      setAttributes(attrs)
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const handleToggleAttribute = (attributeId: string) => {
    setSelectedAttributeIds((prev) =>
      prev.includes(attributeId) ? prev.filter((id) => id !== attributeId) : [...prev, attributeId],
    )
  }

  const handleEnableVariants = async () => {
    if (selectedAttributeIds.length === 0) {
      setError(t('variants.addAttributeFirst'))
      return
    }

    setIsConverting(true)
    setError('')

    try {
      const { productService } = await import('../services/products-sqlite')
      const result = await productService.convertToConfigurable(productId, selectedAttributeIds)

      if (result.success) {
        onSaved()
        onClose()
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={t('variants.enableVariants')} size="md">
      <div>
        {error && (
          <div class="bg-red-500/10 backdrop-blur-sm border border-red-400/20 text-red-700 px-4 py-3 rounded-xl mb-6">
            <div class="flex items-center">
              <span class="text-red-500 mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        <div class="space-y-6">
          <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p class="text-sm text-indigo-900">{t('variants.confirmConvertToConfigurable')}</p>
          </div>

          <div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">{t('variants.selectAttributes')}</h3>
            {attributes.length === 0 ? (
              <div class="text-center py-8 bg-gray-50 rounded-xl">
                <div class="text-4xl mb-2">🏷️</div>
                <p class="text-gray-600">{t('variants.noAttributesAvailable')}</p>
              </div>
            ) : (
              <div class="grid grid-cols-2 gap-3">
                {attributes.map((attr) => {
                  const isSelected = selectedAttributeIds.includes(attr.id)
                  return (
                    <button
                      key={attr.id}
                      type="button"
                      onClick={() => handleToggleAttribute(attr.id)}
                      class={`p-4 rounded-xl text-left transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-white text-gray-700 border border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      <div class="font-semibold">{attr.name}</div>
                      <div class={`text-sm ${isSelected ? 'text-indigo-100' : 'text-gray-500'}`}>
                        {attr.slug}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {selectedAttributeIds.length > 0 && (
            <div class="bg-gray-50 rounded-xl p-4">
              <p class="text-sm text-gray-600">{t('attributes.attributeValues')}:</p>
              <div class="mt-2 flex flex-wrap gap-2">
                {selectedAttributeIds.map((attrId) => {
                  const attr = attributes.find((a) => a.id === attrId)
                  return (
                    <span
                      key={attrId}
                      class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                    >
                      {attr?.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-6 border-t border-gray-200">
        <Button variant="outline" onClick={onClose} disabled={isConverting}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleEnableVariants} disabled={isConverting || selectedAttributeIds.length === 0}>
          {isConverting ? t('common.loading') : t('variants.enableVariants')}
        </Button>
      </div>
    </Dialog>
  )
}
