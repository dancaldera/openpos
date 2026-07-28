import { describe, expect, it } from 'bun:test'
import { computeCartPricing, type PricingLine, type Promotion } from './promotions'

const NOW = '2026-07-27T00:00:00.000Z'

function promo(base: Partial<Promotion> & Pick<Promotion, 'id' | 'type' | 'scopeType'>): Promotion {
  return {
    name: `promo-${base.id}`,
    percent: null,
    buyN: null,
    payM: null,
    scopeValue: null,
    combinable: false,
    isActive: true,
    priority: 0,
    startDate: null,
    endDate: null,
    ...base,
  }
}

function line(base: Partial<PricingLine> & Pick<PricingLine, 'productId' | 'unitPrice' | 'quantity'>): PricingLine {
  return { category: 'General', ...base }
}

describe('computeCartPricing', () => {
  it('applies 3x2 to 5 identical items (one free)', () => {
    const promos = [promo({ id: '1', type: 'nxm', buyN: 3, payM: 2, scopeType: 'product', scopeValue: '["1"]' })]
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 5 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(10)
    expect(result.discountedSubtotal).toBe(40)
  })

  it('applies 3x2 twice on an exact multiple of 6', () => {
    const promos = [promo({ id: '1', type: 'nxm', buyN: 3, payM: 2, scopeType: 'all' })]
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 6 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(20)
  })

  it('does not apply 3x2 below the threshold', () => {
    const promos = [promo({ id: '1', type: 'nxm', buyN: 3, payM: 2, scopeType: 'all' })]
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 2 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(0)
  })

  it('applies a percentage only to lines in the scoped category', () => {
    const promos = [promo({ id: '1', type: 'percentage', percent: 20, scopeType: 'category', scopeValue: 'Beverages' })]
    const lines = [
      line({ productId: '1', category: 'Beverages', unitPrice: 10, quantity: 1 }),
      line({ productId: '2', category: 'Beverages', unitPrice: 5, quantity: 2 }),
      line({ productId: '3', category: 'Food', unitPrice: 8, quantity: 1 }),
    ]
    const result = computeCartPricing(lines, promos, { now: NOW })
    expect(result.totalDiscount).toBe(4)
    expect(result.discountedSubtotal).toBe(24)
    const foodLine = result.lines.find((l) => l.productId === '3')
    expect(foodLine?.discount).toBe(0)
  })

  it('applies a percentage scoped to all products', () => {
    const promos = [promo({ id: '1', type: 'percentage', percent: 10, scopeType: 'all' })]
    const result = computeCartPricing([line({ productId: '1', unitPrice: 20, quantity: 2 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(4)
  })

  it('picks the best single promotion when neither is combinable', () => {
    const promos = [
      promo({ id: '1', type: 'percentage', percent: 20, scopeType: 'all' }),
      promo({ id: '2', type: 'nxm', buyN: 3, payM: 2, scopeType: 'all' }),
    ]
    // qty 3 @ 10: 20% -> 6, 3x2 -> 10. nxm wins, not stacked.
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 3 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(10)
    expect(result.lines[0].appliedPromotionIds).toEqual(['2'])
  })

  it('stacks combinable promotions and beats an exclusive one', () => {
    const promos = [
      promo({ id: '1', type: 'percentage', percent: 10, scopeType: 'all', combinable: true }),
      promo({ id: '2', type: 'nxm', buyN: 3, payM: 2, scopeType: 'all', combinable: true }),
      promo({ id: '3', type: 'percentage', percent: 25, scopeType: 'all', combinable: false }),
    ]
    // qty 3 @ 10: combinable = 10%(3) + 3x2(10) = 13; exclusive 25% = 7.5 -> stack wins.
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 3 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(13)
    expect(result.lines[0].appliedPromotionIds.sort()).toEqual(['1', '2'])
  })

  it('breaks ties by higher priority', () => {
    const promos = [
      promo({ id: '1', type: 'percentage', percent: 10, scopeType: 'all', priority: 1 }),
      promo({ id: '2', type: 'percentage', percent: 10, scopeType: 'all', priority: 5 }),
    ]
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 1 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(1)
    expect(result.lines[0].appliedPromotionIds).toEqual(['2'])
  })

  it('excludes inactive and out-of-window promotions', () => {
    const promos = [
      promo({ id: '1', type: 'percentage', percent: 50, scopeType: 'all', isActive: false }),
      promo({ id: '2', type: 'percentage', percent: 50, scopeType: 'all', endDate: '2026-01-01T00:00:00.000Z' }),
      promo({ id: '3', type: 'percentage', percent: 50, scopeType: 'all', startDate: '2027-01-01T00:00:00.000Z' }),
    ]
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 1 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(0)
  })

  it('frees the cheapest unit across variant lines of the same product', () => {
    const promos = [promo({ id: '1', type: 'nxm', buyN: 3, payM: 2, scopeType: 'all' })]
    const lines = [
      line({ productId: '1', unitPrice: 10, quantity: 1, variantId: 'a' }),
      line({ productId: '1', unitPrice: 6, quantity: 2, variantId: 'b' }),
    ]
    const result = computeCartPricing(lines, promos, { now: NOW })
    expect(result.totalDiscount).toBe(6)
    const sum = result.lines.reduce((s, l) => s + l.discount, 0)
    expect(Math.round(sum * 100) / 100).toBe(6)
  })

  it('rounds fractional discounts to two decimals', () => {
    const promos = [promo({ id: '1', type: 'percentage', percent: 15, scopeType: 'all' })]
    const result = computeCartPricing([line({ productId: '1', unitPrice: 9.99, quantity: 1 })], promos, { now: NOW })
    expect(result.totalDiscount).toBe(1.5)
  })

  it('applies a category offer to subcategories via the ancestors map', () => {
    const promos = [promo({ id: '1', type: 'percentage', percent: 50, scopeType: 'category', scopeValue: 'Bebidas' })]
    const lines = [line({ productId: '1', category: 'Cola', unitPrice: 10, quantity: 1 })]
    const categoryAncestors = { Cola: ['Cola', 'Refrescos', 'Bebidas'] }

    const withCascade = computeCartPricing(lines, promos, { now: NOW, categoryAncestors })
    expect(withCascade.totalDiscount).toBe(5)

    // Without the hierarchy it only matches the exact category name.
    const withoutCascade = computeCartPricing(lines, promos, { now: NOW })
    expect(withoutCascade.totalDiscount).toBe(0)
  })

  it('returns zero discount when there are no active promotions', () => {
    const result = computeCartPricing([line({ productId: '1', unitPrice: 10, quantity: 2 })], [], { now: NOW })
    expect(result.totalDiscount).toBe(0)
    expect(result.discountedSubtotal).toBe(20)
    expect(result.lines[0].discount).toBe(0)
  })
})
