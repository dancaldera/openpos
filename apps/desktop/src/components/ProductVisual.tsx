import type { Product } from '../services/products-turso'

const getCategoryIcon = (category: string): string => {
  const icons: { [key: string]: string } = {
    Beverages: '🥤',
    Bakery: '🍞',
    'Coffee & Tea': '☕',
    Dairy: '🥛',
    Snacks: '🍫',
    Seafood: '🐟',
    'Frozen Foods': '🧊',
    'Fresh Produce': '🍎',
    'Meat & Poultry': '🍖',
    'Pantry Items': '🥫',
    'Condiments & Sauces': '🫙',
    'Breakfast Items': '🍳',
    'Household Items': '🧽',
    'Personal Care': '🧴',
    Electronics: '📱',
    Other: '📦',
  }
  return icons[category] || '📦'
}

export interface ProductVisualProps {
  product?: Product
  name: string
  imageUrl?: string
  sizeClass?: string
  roundedClass?: string
  className?: string
}

export function ProductVisual({
  product,
  name,
  imageUrl,
  sizeClass = 'h-10 w-10',
  roundedClass = 'rounded-cards',
  className = '',
}: ProductVisualProps) {
  return (
    <div
      class={`flex shrink-0 items-center justify-center overflow-hidden bg-chalk text-void ${sizeClass} ${roundedClass} ${className}`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} class="h-full w-full object-cover" />
      ) : (
        <span class="text-base leading-none">{getCategoryIcon(product?.category || 'Other')}</span>
      )}
    </div>
  )
}
