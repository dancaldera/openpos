import OrderDetailPage from './OrderDetailPage'
import OrderFormPage from './OrderFormPage'
import OrdersListPage from './OrdersListPage'

/** `orders`, `orders/new`, `orders/<id>`, `orders/<id>/edit`. */
export default function OrdersSection({ params }: { params: string[] }) {
  const [first, second] = params
  if (!first) return <OrdersListPage />
  if (first === 'new') return <OrderFormPage key="new" />
  if (second === 'edit') return <OrderFormPage key={`edit-${first}`} orderId={first} />
  return <OrderDetailPage key={first} orderId={first} />
}
