// Emoji fallback icon for a category when it has no custom image.
const CATEGORY_ICONS: { [key: string]: string } = {
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

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] || '🏷️'
}
