import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../hooks/useTranslation'
import { toast } from '../../lib/toast'
import { companySettingsService } from '../../services/company-settings-turso'
import { resolveProductImageUrls } from '../../services/product-images'
import { type ProductAttribute, productVariantsService } from '../../services/product-variants-turso'
import { type ProductWithVariants, productService } from '../../services/products-turso'
import type { Translate } from './productMeta'

export interface ProductPermissions {
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
}

/** Same rules the catalog has always used: admins and managers, or users holding the permission. */
export function useProductPermissions(): ProductPermissions {
  const { user, hasRole, hasPermission } = useAuth()
  const isManager = Boolean(user) && (hasRole('admin') || hasRole('manager'))
  return {
    canView: Boolean(user) && (isManager || hasPermission('products.view')),
    canCreate: Boolean(user) && (isManager || hasPermission('products.create')),
    canEdit: Boolean(user) && (isManager || hasPermission('products.edit')),
    canDelete: Boolean(user) && (isManager || hasPermission('products.delete')),
  }
}

/**
 * `t` that keeps its identity across renders, for effects and callbacks that only
 * need it for messages (the hook's own `t` is recreated on every render).
 */
export function useStableTranslate(): Translate {
  const { t } = useTranslation()
  const ref = useRef(t)
  ref.current = t
  return useCallback<Translate>((key, params) => ref.current(key, params), [])
}

/** Store currency symbol for prices; `$` until settings load. */
export function useCurrencySymbol(): string {
  const [symbol, setSymbol] = useState('$')
  useEffect(() => {
    let isCancelled = false
    companySettingsService
      .getSettings()
      .then((settings) => {
        if (!isCancelled && settings?.currencySymbol) setSymbol(settings.currencySymbol)
      })
      .catch(() => {})
    return () => {
      isCancelled = true
    }
  }, [])
  return symbol
}

/** One product with its variants and resolved image URL. */
export function useProduct(productId: string) {
  const t = useStableTranslate()
  const [product, setProduct] = useState<ProductWithVariants | null>(null)
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const loaded = await productService.getProductWithVariants(productId)
      setProduct(loaded)
      const key = loaded?.image?.trim()
      if (key) {
        const urls = await resolveProductImageUrls([key]).catch(() => ({}) as Record<string, string>)
        setImageUrl(urls[key])
      } else {
        setImageUrl(undefined)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }, [productId, t])

  useEffect(() => {
    setIsLoading(true)
    void reload()
  }, [reload])

  return { product, imageUrl, isLoading, reload }
}

/** Active product attributes (colour, size, ...) used to build variants. */
export function useAttributes() {
  const t = useStableTranslate()
  const [attributes, setAttributes] = useState<ProductAttribute[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false
    productVariantsService
      .getAttributes()
      .then((result) => {
        if (!isCancelled) setAttributes(result)
      })
      .catch(() => {
        if (!isCancelled) toast.error(t('errors.generic'))
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [t])

  return { attributes, isLoading }
}

/**
 * Attributes a configurable product varies by (from its variant settings), or every
 * attribute when the product has none recorded.
 */
export function useVariantAttributes(productId: string) {
  const { attributes, isLoading } = useAttributes()
  const [allowedIds, setAllowedIds] = useState<string[] | null>(null)

  useEffect(() => {
    let isCancelled = false
    productVariantsService
      .getVariantSettings(productId)
      .then((settings) => {
        if (!isCancelled) setAllowedIds(settings?.attributeIds?.length ? settings.attributeIds : null)
      })
      .catch(() => {})
    return () => {
      isCancelled = true
    }
  }, [productId])

  const productAttributes = useMemo<ProductAttribute[]>(() => {
    if (!allowedIds) return attributes
    const allowed = attributes.filter((attribute) => allowedIds.includes(attribute.id))
    return allowed.length > 0 ? allowed : attributes
  }, [attributes, allowedIds])

  return { attributes: productAttributes, isLoading }
}
