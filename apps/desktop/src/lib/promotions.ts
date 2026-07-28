// Pure promotion pricing. No DB/service imports so both the cart UI
// (Orders.tsx) and the server-authoritative path (orders-turso.ts) can import
// it, and it can be unit-tested in isolation.

export type PromotionType = 'percentage' | 'nxm'
export type PromotionScope = 'all' | 'category' | 'product'

export interface Promotion {
  id: string
  name: string
  type: PromotionType
  percent?: number | null
  buyN?: number | null
  payM?: number | null
  scopeType: PromotionScope
  scopeValue?: string | null
  combinable: boolean
  isActive: boolean
  priority: number
  startDate?: string | null
  endDate?: string | null
}

export interface PricingLine {
  productId: string
  category: string
  unitPrice: number
  quantity: number
  variantId?: string
}

export interface LineDiscount {
  productId: string
  variantId?: string
  lineSubtotal: number
  discount: number
  appliedPromotionIds: string[]
}

export interface PricingResult {
  lines: LineDiscount[]
  totalDiscount: number
  discountedSubtotal: number
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function isPromotionLive(promo: Promotion, nowISO: string): boolean {
  if (!promo.isActive) {
    return false
  }
  if (promo.startDate && nowISO < promo.startDate) {
    return false
  }
  if (promo.endDate && nowISO > promo.endDate) {
    return false
  }
  return true
}

export function matchesScope(
  promo: Promotion,
  line: PricingLine,
  categoryAncestors?: Record<string, string[]>,
): boolean {
  if (promo.scopeType === 'all') {
    return true
  }
  if (promo.scopeType === 'category') {
    // A category-scoped promo also covers the category's subcategories: match
    // if the promo's category is the line's category or any of its ancestors.
    const ancestors = categoryAncestors?.[line.category] ?? [line.category]
    return promo.scopeValue != null && ancestors.includes(promo.scopeValue)
  }
  if (promo.scopeType === 'product') {
    if (!promo.scopeValue) {
      return false
    }
    try {
      const ids = JSON.parse(promo.scopeValue)
      return Array.isArray(ids) && ids.includes(line.productId)
    } catch {
      return false
    }
  }
  return false
}

/** Discount for one product group given its flattened per-unit price array. */
export function computeGroupDiscount(promo: Promotion, unitPrices: number[]): number {
  if (unitPrices.length === 0) {
    return 0
  }

  if (promo.type === 'percentage') {
    const percent = promo.percent ?? 0
    if (percent <= 0) {
      return 0
    }
    const subtotal = unitPrices.reduce((sum, price) => sum + price, 0)
    return round2(subtotal * (percent / 100))
  }

  if (promo.type === 'nxm') {
    const buyN = promo.buyN ?? 0
    const payM = promo.payM ?? 0
    if (buyN <= 0 || payM < 0 || payM >= buyN) {
      return 0
    }
    const freePerGroup = buyN - payM
    const freeUnits = Math.floor(unitPrices.length / buyN) * freePerGroup
    if (freeUnits <= 0) {
      return 0
    }
    // Cheapest-free: the customer pays for the most expensive units.
    const sorted = [...unitPrices].sort((a, b) => a - b)
    let discount = 0
    for (let i = 0; i < freeUnits; i++) {
      discount += sorted[i]
    }
    return round2(discount)
  }

  return 0
}

function promoPriority(promos: Promotion[], id: string): number {
  return promos.find((promo) => promo.id === id)?.priority ?? 0
}

/**
 * Combinability rule lives here (the single place to tune stacking).
 * Candidates for a product group:
 *  - each exclusive (non-combinable) applicable promo applied alone, and
 *  - all combinable applicable promos summed together (clamped to subtotal).
 * The largest-saving candidate wins; ties break by higher priority, then lower id.
 */
export function selectGroupDiscount(
  unitPrices: number[],
  promos: Promotion[],
  nowISO: string,
  line: PricingLine,
  categoryAncestors?: Record<string, string[]>,
): { discount: number; appliedPromotionIds: string[] } {
  const groupSubtotal = unitPrices.reduce((sum, price) => sum + price, 0)
  const applicable = promos.filter(
    (promo) => isPromotionLive(promo, nowISO) && matchesScope(promo, line, categoryAncestors),
  )
  if (applicable.length === 0) {
    return { discount: 0, appliedPromotionIds: [] }
  }

  const candidates: { discount: number; ids: string[] }[] = []

  const combinables = applicable.filter((promo) => promo.combinable)
  if (combinables.length > 0) {
    let sum = 0
    const ids: string[] = []
    for (const promo of combinables) {
      const discount = computeGroupDiscount(promo, unitPrices)
      if (discount > 0) {
        sum += discount
        ids.push(promo.id)
      }
    }
    if (ids.length > 0) {
      candidates.push({ discount: round2(Math.min(sum, groupSubtotal)), ids })
    }
  }

  for (const promo of applicable.filter((p) => !p.combinable)) {
    const discount = computeGroupDiscount(promo, unitPrices)
    if (discount > 0) {
      candidates.push({ discount: round2(Math.min(discount, groupSubtotal)), ids: [promo.id] })
    }
  }

  if (candidates.length === 0) {
    return { discount: 0, appliedPromotionIds: [] }
  }

  candidates.sort((a, b) => {
    if (b.discount !== a.discount) {
      return b.discount - a.discount
    }
    const priorityA = Math.max(...a.ids.map((id) => promoPriority(promos, id)))
    const priorityB = Math.max(...b.ids.map((id) => promoPriority(promos, id)))
    if (priorityB !== priorityA) {
      return priorityB - priorityA
    }
    const idA = Math.min(...a.ids.map((id) => parseInt(id, 10)))
    const idB = Math.min(...b.ids.map((id) => parseInt(id, 10)))
    return idA - idB
  })

  return { discount: candidates[0].discount, appliedPromotionIds: candidates[0].ids }
}

/** Apply active promotions to a cart, returning per-line and total discount. */
export function computeCartPricing(
  lines: PricingLine[],
  promos: Promotion[],
  opts: { now: string; categoryAncestors?: Record<string, string[]> },
): PricingResult {
  const groups = new Map<string, PricingLine[]>()
  for (const line of lines) {
    const existing = groups.get(line.productId) ?? []
    existing.push(line)
    groups.set(line.productId, existing)
  }

  const resultLines: LineDiscount[] = []
  let totalDiscount = 0

  for (const [productId, groupLines] of groups) {
    const unitPrices: number[] = []
    for (const line of groupLines) {
      for (let i = 0; i < line.quantity; i++) {
        unitPrices.push(line.unitPrice)
      }
    }
    const groupSubtotal = unitPrices.reduce((sum, price) => sum + price, 0)
    const { discount: groupDiscount, appliedPromotionIds } = selectGroupDiscount(
      unitPrices,
      promos,
      opts.now,
      groupLines[0],
      opts.categoryAncestors,
    )

    // Distribute the group discount across member lines proportionally; the
    // last line absorbs any rounding remainder.
    let distributed = 0
    groupLines.forEach((line, index) => {
      const lineSubtotal = round2(line.unitPrice * line.quantity)
      let lineDiscount: number
      if (index === groupLines.length - 1) {
        lineDiscount = round2(groupDiscount - distributed)
      } else {
        lineDiscount = groupSubtotal > 0 ? round2((groupDiscount * lineSubtotal) / groupSubtotal) : 0
        distributed = round2(distributed + lineDiscount)
      }
      lineDiscount = Math.min(Math.max(lineDiscount, 0), lineSubtotal)
      resultLines.push({
        productId,
        variantId: line.variantId,
        lineSubtotal,
        discount: lineDiscount,
        appliedPromotionIds: lineDiscount > 0 ? appliedPromotionIds : [],
      })
    })

    totalDiscount = round2(totalDiscount + groupDiscount)
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))
  return {
    lines: resultLines,
    totalDiscount: round2(totalDiscount),
    discountedSubtotal: round2(subtotal - totalDiscount),
  }
}
