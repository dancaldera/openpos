import { useCallback, useEffect, useState } from 'react'
import { toast } from '../../lib/toast'
import { type CompanySettings, companySettingsService } from '../../services/company-settings-turso'
import { type Customer, customerService } from '../../services/customers-turso'
import { resolveProductImageUrls } from '../../services/product-images'
import { type Product, type ProductWithVariants, productService } from '../../services/products-turso'
import { userService } from '../../services/users-turso'

export interface OrderReferenceData {
  settings: CompanySettings | null
  currencySymbol: string
  taxEnabled: boolean
  /** Tax as a fraction, e.g. 0.16. Zero when tax is disabled. */
  taxRate: number
  productCatalog: Product[]
  productsWithVariants: Record<string, ProductWithVariants>
  customers: Customer[]
  userNames: Record<string, string>
  imageUrls: Record<string, string>
}

interface Options {
  /** Load variants for configurable products (only the order form needs them). */
  withVariants?: boolean
  withCustomers?: boolean
  withUsers?: boolean
}

const EMPTY: OrderReferenceData = {
  settings: null,
  currencySymbol: '$',
  taxEnabled: false,
  taxRate: 0,
  productCatalog: [],
  productsWithVariants: {},
  customers: [],
  userNames: {},
  imageUrls: {},
}

/** Settings, catalog, customers and staff names that order screens render against. */
export function useOrderReferenceData({
  withVariants = false,
  withCustomers = false,
  withUsers = false,
}: Options = {}) {
  const [data, setData] = useState<OrderReferenceData>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [settings, products, customers, users] = await Promise.all([
        companySettingsService.getSettings(),
        productService.getProducts(),
        withCustomers ? customerService.getCustomers() : Promise.resolve([] as Customer[]),
        withUsers ? userService.getUsers() : Promise.resolve([]),
      ])

      const productsWithVariants: Record<string, ProductWithVariants> = {}
      if (withVariants) {
        const configurable = products.filter((product) => product.variantType === 'configurable')
        const loaded = await Promise.all(
          configurable.map((product) => productService.getProductWithVariants(product.id).catch(() => null)),
        )
        for (const product of loaded) {
          if (product) productsWithVariants[product.id] = product
        }
      }

      const imageKeys = Array.from(
        new Set(products.map((product) => product.image?.trim()).filter(Boolean)),
      ) as string[]
      const imageUrls = imageKeys.length > 0 ? await resolveProductImageUrls(imageKeys).catch(() => ({})) : {}

      setData({
        settings,
        currencySymbol: settings.currencySymbol,
        taxEnabled: settings.taxEnabled,
        taxRate: settings.taxEnabled ? settings.taxPercentage / 100 : 0,
        productCatalog: products,
        productsWithVariants,
        customers: customers.filter((customer) => customer.isActive),
        userNames: Object.fromEntries(users.map((user) => [user.id, user.name])),
        imageUrls,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoading(false)
    }
  }, [withCustomers, withUsers, withVariants])

  useEffect(() => {
    void load()
  }, [load])

  return { ...data, isLoading, reload: load }
}
