import type { StatusDotVariant } from '@astryxdesign/core/StatusDot'
import type { Order } from '../../services/orders-turso'

type Translate = (key: string, params?: Record<string, string | number | boolean>) => string

export type OrderStatus = Order['status']
export type PaymentMethod = NonNullable<Order['paymentMethod']>

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'paid', 'completed', 'cancelled']
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer']

const STATUS_DOT: Record<OrderStatus, StatusDotVariant> = {
  pending: 'warning',
  paid: 'accent',
  completed: 'success',
  cancelled: 'neutral',
}

export function orderStatusLabel(status: OrderStatus, t: Translate): string {
  return t(`orders.${status}`)
}

export function orderStatusDot(status: OrderStatus): StatusDotVariant {
  return STATUS_DOT[status]
}

export function paymentMethodLabel(method: PaymentMethod | undefined, t: Translate): string {
  return method ? t(`orders.${method}`) : t('orders.noPaymentMethod')
}

export function variantLabel(attributes?: Record<string, string>): string {
  if (!attributes) return ''
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
}

/** Orders the date filter offers: everything, today, yesterday, and the five days before. */
export function dateFilterOptions(t: Translate, now = new Date()): Array<{ value: string; label: string }> {
  const options = [
    { value: 'all', label: t('orders.allDates') },
    { value: 'today', label: t('dates.today') },
    { value: 'yesterday', label: t('dates.yesterday') },
  ]
  for (let daysAgo = 2; daysAgo <= 6; daysAgo++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    options.push({
      value,
      label: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    })
  }
  return options
}
