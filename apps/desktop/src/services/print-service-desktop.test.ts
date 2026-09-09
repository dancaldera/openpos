import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanySettings } from './company-settings-turso'
import type { Order } from './orders-turso'

const { printThermalReceipt } = vi.hoisted(() => ({
  printThermalReceipt: vi.fn(async (_receipt: string) => 'ok'),
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => ({ printThermalReceipt })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const { printThermalReceipt: printReceipt } = await import('./print-service')

const settings = {} as unknown as CompanySettings
const order = {
  id: 'order-9',
  subtotal: 10,
  tax: 0,
  total: 10,
  status: 'completed',
  items: [],
  createdAt: '2026-04-24T10:00:00.000Z',
  updatedAt: '2026-04-24T10:00:00.000Z',
} as unknown as Order

describe('printThermalReceipt on desktop', () => {
  beforeEach(() => {
    printThermalReceipt.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('delegates to the desktop IPC printer', async () => {
    printThermalReceipt.mockResolvedValueOnce('printed:order-9')

    const { formatReceiptData } = await import('./print-service')
    const receipt = formatReceiptData(order, settings)

    await expect(printReceipt(receipt)).resolves.toBe('printed:order-9')
    expect(printThermalReceipt).toHaveBeenCalledWith(expect.stringContaining('order'))
  })

  it('wraps desktop printer errors', async () => {
    const { formatReceiptData } = await import('./print-service')
    const receipt = formatReceiptData(order, settings)

    printThermalReceipt.mockImplementationOnce(() => {
      throw new Error('no printer')
    })

    await expect(printReceipt(receipt)).rejects.toThrow('Print command failed: no printer')
  })

  it('wraps non-error desktop failures', async () => {
    const { formatReceiptData } = await import('./print-service')
    const receipt = formatReceiptData(order, settings)

    printThermalReceipt.mockImplementationOnce(() => {
      throw 'boom'
    })

    await expect(printReceipt(receipt)).rejects.toThrow('Print command failed: boom')
  })
})
