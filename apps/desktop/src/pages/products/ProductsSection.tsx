import EnableVariantsPage from './EnableVariantsPage'
import GenerateVariantsPage from './GenerateVariantsPage'
import ProductDetailPage from './ProductDetailPage'
import ProductFormPage from './ProductFormPage'
import { ProductAccessDeniedPage } from './ProductPageStates'
import ProductsListPage from './ProductsListPage'
import { useProductPermissions } from './useProductData'
import VariantFormPage from './VariantFormPage'

/**
 * `products`, `products/new`, `products/<id>`, `products/<id>/edit`,
 * `products/<id>/variants/enable`, `products/<id>/variants/generate`,
 * `products/<id>/variants/new`, `products/<id>/variants/<variantId>`.
 */
export default function ProductsSection({ params }: { params: string[] }) {
  const permissions = useProductPermissions()
  const [first, second, third] = params

  if (!permissions.canView) return <ProductAccessDeniedPage canView={false} />
  if (!first) return <ProductsListPage permissions={permissions} />

  if (first === 'new') {
    if (!permissions.canCreate) return <ProductAccessDeniedPage canView />
    return <ProductFormPage key="new" />
  }

  if (!second) return <ProductDetailPage key={first} productId={first} permissions={permissions} />

  if (!permissions.canEdit) return <ProductAccessDeniedPage canView />
  if (second === 'edit') return <ProductFormPage key={`edit-${first}`} productId={first} />
  if (second === 'variants' && third === 'enable') return <EnableVariantsPage key={first} productId={first} />
  if (second === 'variants' && third === 'generate') return <GenerateVariantsPage key={first} productId={first} />
  if (second === 'variants' && third === 'new') return <VariantFormPage key={`${first}-new`} productId={first} />
  if (second === 'variants' && third) {
    return <VariantFormPage key={`${first}-${third}`} productId={first} variantId={third} />
  }
  return <ProductDetailPage key={first} productId={first} permissions={permissions} />
}
