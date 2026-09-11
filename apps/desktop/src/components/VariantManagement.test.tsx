// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getAttributesMock, createVariantMock, updateVariantMock, generateVariantsMock, convertToConfigurableMock } =
  vi.hoisted(() => ({
    getAttributesMock: vi.fn(async () => [] as unknown[]),
    createVariantMock: vi.fn(async () => ({
      success: true as boolean,
      variant: undefined as unknown,
      error: undefined as string | undefined,
    })),
    updateVariantMock: vi.fn(async () => ({
      success: true as boolean,
      variant: undefined as unknown,
      error: undefined as string | undefined,
    })),
    generateVariantsMock: vi.fn(async () => ({
      success: true as boolean,
      variants: [] as unknown[],
      error: undefined as string | undefined,
    })),
    convertToConfigurableMock: vi.fn(async () => ({
      success: true as boolean,
      error: undefined as string | undefined,
    })),
  }))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number | boolean>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}))

vi.mock('../services/product-variants-turso', () => ({
  productVariantsService: {
    getAttributes: getAttributesMock,
    createVariant: createVariantMock,
    updateVariant: updateVariantMock,
    generateVariants: generateVariantsMock,
  },
}))

vi.mock('../services/products-turso', () => ({
  productService: { convertToConfigurable: convertToConfigurableMock },
}))

const { ProductVariantRow, EditVariantModal, VariantGenerator, VariantSettingsModal } = await import(
  './VariantManagement'
)

const attrs = [
  { id: 'color', name: 'Color', slug: 'color', values: ['Red', 'Blue'], isActive: true, createdAt: '', updatedAt: '' },
  { id: 'size', name: 'Size', slug: 'size', values: ['S', 'M'], isActive: true, createdAt: '', updatedAt: '' },
]

const baseVariant = {
  id: '7',
  parentProductId: '1',
  sku: 'SKU-7',
  barcode: '123',
  price: 10,
  cost: 5,
  stock: 3,
  attributes: { color: 'Red' },
  image: undefined,
  isActive: true,
  position: 0,
  createdAt: '',
  updatedAt: '',
}

function savedVariant() {
  return { ...baseVariant, id: '8' }
}

afterEach(() => {
  cleanup()
  getAttributesMock.mockReset()
  createVariantMock.mockReset()
  updateVariantMock.mockReset()
  generateVariantsMock.mockReset()
  convertToConfigurableMock.mockReset()
  getAttributesMock.mockResolvedValue([])
})

describe('ProductVariantRow', () => {
  it('renders variant details and handles actions', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<ProductVariantRow variant={baseVariant} onEdit={onEdit} onDelete={onDelete} />)

    expect(screen.getByText('SKU-7')).toBeDefined()
    expect(screen.getByText('$10.00')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('Red')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '✏️' }))
    expect(onEdit).toHaveBeenCalledWith(baseVariant)
    fireEvent.click(screen.getByRole('button', { name: '🗑️' }))
    expect(onDelete).toHaveBeenCalledWith('7')
  })

  it('covers stock levels and missing skus', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const { unmount } = render(
      <ProductVariantRow variant={{ ...baseVariant, stock: 0, sku: undefined }} onEdit={onEdit} onDelete={onDelete} />,
    )
    expect(screen.getByText('-')).toBeDefined()
    unmount()
    cleanup()

    render(<ProductVariantRow variant={{ ...baseVariant, stock: 25 }} onEdit={onEdit} onDelete={onDelete} />)
    expect(screen.getByText('25')).toBeDefined()
  })
})

describe('EditVariantModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <EditVariantModal variant={null} productId="1" isOpen={false} onClose={() => {}} onSave={() => {}} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('creates a variant with typed values', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    createVariantMock.mockResolvedValueOnce({ success: true, variant: savedVariant(), error: undefined })
    render(<EditVariantModal variant={null} productId="1" isOpen onClose={onClose} onSave={onSave} />)

    expect(screen.getByText('variants.addVariant')).toBeDefined()
    expect(screen.getByText('variants.barcodeHelp')).toBeDefined()
    expect(screen.queryByText('products.profitMarginLabel')).toBeNull()

    fireEvent.input(screen.getByLabelText('variants.sku', { exact: false }), { target: { value: 'SKU-9' } })
    fireEvent.input(screen.getByLabelText('variants.barcode', { exact: false }), { target: { value: 'ABC 123' } })
    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '12' } })
    fireEvent.input(screen.getByLabelText('common.cost', { exact: false }), { target: { value: '6' } })
    fireEvent.input(screen.getByLabelText('variants.variantStock', { exact: false }), { target: { value: '4' } })

    // Normalized barcode help and the profit margin appear once priced.
    await screen.findByText(/variants\.barcodeNormalizedHelp/)
    expect(screen.getByText('products.profitMarginLabel')).toBeDefined()

    const statusSelect = screen.getByLabelText('products.status', { exact: false }) as HTMLSelectElement
    // NOTE: fireEvent.change does not reach this select under happy-dom, so the
    // selection is set directly and a bubbling change event is dispatched instead.
    statusSelect.selectedIndex = 1
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))

    await vi.waitFor(() =>
      expect(createVariantMock).toHaveBeenCalledWith(
        expect.objectContaining({
          parentProductId: '1',
          sku: 'SKU-9',
          barcode: 'ABC 123',
          price: 12,
          cost: 6,
          stock: 4,
          isActive: false,
        }),
      ),
    )
    expect(onSave).toHaveBeenCalledWith(savedVariant())
    expect(onClose).toHaveBeenCalled()
  })

  it('updates an existing variant', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const updated = { ...baseVariant, price: 20 }
    updateVariantMock.mockResolvedValueOnce({ success: true, variant: updated, error: undefined })
    render(<EditVariantModal variant={baseVariant} productId="1" isOpen onClose={onClose} onSave={onSave} />)

    expect(screen.getByText('variants.editVariant')).toBeDefined()
    expect((screen.getByLabelText('variants.sku', { exact: false }) as HTMLInputElement).value).toBe('SKU-7')
    expect(screen.getByText('products.profitMarginLabel')).toBeDefined()

    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await vi.waitFor(() => expect(updateVariantMock).toHaveBeenCalledWith('7', expect.objectContaining({ price: 20 })))
    expect(onSave).toHaveBeenCalledWith(updated)
    expect(onClose).toHaveBeenCalled()
  })

  it('reports save failures', async () => {
    const onSave = vi.fn()
    render(<EditVariantModal variant={null} productId="1" isOpen onClose={() => {}} onSave={onSave} />)

    createVariantMock.mockResolvedValueOnce({ success: false, variant: undefined, error: 'taken' })
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    await screen.findByText('taken')
    expect(onSave).not.toHaveBeenCalled()

    createVariantMock.mockResolvedValueOnce({ success: false, variant: undefined, error: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    await screen.findByText('errors.generic')

    createVariantMock.mockRejectedValueOnce(new Error('down'))
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    await vi.waitFor(() => expect(screen.getAllByText('errors.generic').length).toBeGreaterThan(0))
  })

  it('treats blank numbers as zero', async () => {
    createVariantMock.mockResolvedValueOnce({ success: true, variant: savedVariant(), error: undefined })
    const onSave = vi.fn()
    render(<EditVariantModal variant={null} productId="1" isOpen onClose={() => {}} onSave={onSave} />)

    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '' } })
    fireEvent.input(screen.getByLabelText('common.cost', { exact: false }), { target: { value: '' } })
    fireEvent.input(screen.getByLabelText('variants.variantStock', { exact: false }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))

    await vi.waitFor(() =>
      expect(createVariantMock).toHaveBeenCalledWith(expect.objectContaining({ price: 0, cost: 0, stock: 0 })),
    )
    expect(onSave).toHaveBeenCalled()
  })

  it('shows the loading state and cancels', async () => {
    const onClose = vi.fn()
    let resolveCreate!: (value: { success: boolean; variant: unknown; error: string | undefined }) => void
    createVariantMock.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean; variant: unknown; error: string | undefined }>(
          (resolve) => (resolveCreate = resolve),
        ),
    )
    render(<EditVariantModal variant={null} productId="1" isOpen onClose={onClose} onSave={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    await screen.findByText('common.loading')
    resolveCreate({ success: true, variant: savedVariant(), error: undefined })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    cleanup()

    const onCloseSecond = vi.fn()
    render(<EditVariantModal variant={null} productId="1" isOpen onClose={onCloseSecond} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(onCloseSecond).toHaveBeenCalled()
  })
})

describe('VariantGenerator', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <VariantGenerator productId="1" isOpen={false} onClose={() => {}} onGenerated={() => {}} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows a spinner while attributes load', async () => {
    let resolveAttrs!: (value: typeof attrs) => void
    getAttributesMock.mockImplementationOnce(() => new Promise<typeof attrs>((resolve) => (resolveAttrs = resolve)))
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={() => {}} />)
    await vi.waitFor(() => expect(document.querySelector('.animate-spin')).toBeDefined())
    resolveAttrs(attrs)
    await screen.findByText('Color')
  })

  it('reports attribute load failures', async () => {
    getAttributesMock.mockRejectedValueOnce(new Error('down'))
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={() => {}} />)
    await screen.findByText('errors.generic')
  })

  it('shows an empty state without attributes', async () => {
    getAttributesMock.mockResolvedValueOnce([])
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={() => {}} />)
    await screen.findByText('variants.noAttributesAvailable')
    expect(screen.getByRole('button', { name: 'common.next' }).hasAttribute('disabled')).toBe(true)
  })

  it('selects values and walks to the details step', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={() => {}} />)
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    await screen.findByText(/variants\.selectValues/)
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
    // Deselecting the only value of an attribute removes the attribute key.
    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    fireEvent.click(screen.getByRole('button', { name: 'S' }))

    fireEvent.click(screen.getByRole('button', { name: 'common.next' }))
    await screen.findByText(/common\.details/)
    expect(screen.getByText(/Color: Red/)).toBeDefined()
    expect(screen.getByText(/Size: S/)).toBeDefined()

    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '15' } })
    fireEvent.input(screen.getByLabelText('common.cost', { exact: false }), { target: { value: '7' } })
    fireEvent.input(screen.getByLabelText('variants.variantStock', { exact: false }), { target: { value: '5' } })

    fireEvent.click(screen.getByRole('button', { name: 'common.previous' }))
    await screen.findByText('variants.selectAttributes')
  })

  it('treats blank base numbers as zero', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={() => {}} />)
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.next' }))
    await screen.findByText(/common\.details/)

    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '' } })
    fireEvent.input(screen.getByLabelText('common.cost', { exact: false }), { target: { value: '' } })
    fireEvent.input(screen.getByLabelText('variants.variantStock', { exact: false }), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'variants.generateVariants' }).hasAttribute('disabled')).toBe(true)
  })

  it('generates variants from the details step', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    const onGenerated = vi.fn()
    const onClose = vi.fn()
    const generated = [{ ...baseVariant, id: '9' }]
    generateVariantsMock.mockResolvedValueOnce({ success: true, variants: generated, error: undefined })
    render(<VariantGenerator productId="1" isOpen onClose={onClose} onGenerated={onGenerated} />)
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.next' }))
    await screen.findByText(/common\.details/)

    // Generation stays disabled until a base price is set.
    expect(screen.getByRole('button', { name: 'variants.generateVariants' }).hasAttribute('disabled')).toBe(true)
    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'variants.generateVariants' }))

    await vi.waitFor(() =>
      expect(generateVariantsMock).toHaveBeenCalledWith('1', { color: ['Red'] }, { price: 15, cost: 0, stock: 0 }),
    )
    expect(onGenerated).toHaveBeenCalledWith(generated)
    expect(onClose).toHaveBeenCalled()
  })

  it('guards generation without selected attributes', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={() => {}} />)
    await screen.findByText('Color')

    // Step two is only reachable through the disabled Next button here.
    const next = screen.getByRole('button', { name: 'common.next' })
    next.removeAttribute('disabled')
    fireEvent.click(next)
    await screen.findByText(/common\.details/)
    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'variants.generateVariants' }))

    await screen.findByText('variants.addAttributeFirst')
    expect(generateVariantsMock).not.toHaveBeenCalled()
  })

  it('shows generation progress', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    let resolveGenerate!: (value: { success: boolean; variants: unknown[]; error: string | undefined }) => void
    generateVariantsMock.mockImplementationOnce(
      () =>
        new Promise<{ success: boolean; variants: unknown[]; error: string | undefined }>(
          (resolve) => (resolveGenerate = resolve),
        ),
    )
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={() => {}} />)
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.next' }))
    await screen.findByText(/common\.details/)
    fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'variants.generateVariants' }))

    await screen.findByText('variants.generatingVariants')
    resolveGenerate({ success: true, variants: [], error: undefined })
    await vi.waitFor(() => expect(generateVariantsMock).toHaveBeenCalled())
  })

  it('reports generation failures', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    const onGenerated = vi.fn()
    render(<VariantGenerator productId="1" isOpen onClose={() => {}} onGenerated={onGenerated} />)
    await screen.findByText('Color')

    // Failed generations keep the selection, so select once up front.
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))

    async function generateOnce() {
      fireEvent.click(screen.getByRole('button', { name: 'common.next' }))
      await screen.findByText(/common\.details/)
      fireEvent.input(screen.getByLabelText('variants.variantPrice', { exact: false }), { target: { value: '15' } })
      fireEvent.click(screen.getByRole('button', { name: 'variants.generateVariants' }))
    }

    generateVariantsMock.mockResolvedValueOnce({ success: false, variants: [], error: 'taken' })
    await generateOnce()
    await screen.findByText('taken')
    // A failed generation stays on the details step.
    fireEvent.click(screen.getByRole('button', { name: 'common.previous' }))
    await screen.findByText('variants.selectAttributes')

    generateVariantsMock.mockResolvedValueOnce({ success: false, variants: [], error: undefined })
    await generateOnce()
    await screen.findByText('errors.generic')
    fireEvent.click(screen.getByRole('button', { name: 'common.previous' }))
    await screen.findByText('variants.selectAttributes')

    generateVariantsMock.mockRejectedValueOnce(new Error('down'))
    await generateOnce()
    await vi.waitFor(() => expect(screen.getAllByText('errors.generic').length).toBeGreaterThan(0))
    expect(onGenerated).not.toHaveBeenCalled()
  })
})

describe('VariantSettingsModal', () => {
  function openModal() {
    return render(<VariantSettingsModal productId="1" isOpen onClose={() => {}} onSaved={() => {}} />)
  }

  function enableButton() {
    // The dialog title and the enable button share the same label.
    const matches = screen.getAllByText('variants.enableVariants')
    return matches[matches.length - 1].closest('button') as HTMLButtonElement
  }

  it('renders nothing when closed', () => {
    const { container } = render(
      <VariantSettingsModal productId="1" isOpen={false} onClose={() => {}} onSaved={() => {}} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows an empty state without attributes', async () => {
    getAttributesMock.mockResolvedValueOnce([])
    openModal()
    await screen.findByText('variants.noAttributesAvailable')
  })

  it('reports attribute load failures', async () => {
    getAttributesMock.mockRejectedValueOnce(new Error('down'))
    openModal()
    await screen.findByText('errors.generic')
  })

  it('selects attributes and enables variants', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(<VariantSettingsModal productId="1" isOpen onClose={onClose} onSaved={onSaved} />)
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: /Color/ }))
    await screen.findByText(/attributes\.attributeValues/)
    fireEvent.click(screen.getByRole('button', { name: /Size/ }))

    fireEvent.click(enableButton())
    await vi.waitFor(() => expect(convertToConfigurableMock).toHaveBeenCalledWith('1', ['color', 'size']))
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles attributes back off', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    openModal()
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: /Color/ }))
    await screen.findByText(/attributes\.attributeValues/)
    fireEvent.click(screen.getByRole('button', { name: /Color/ }))
    await vi.waitFor(() => expect(screen.queryByText(/attributes\.attributeValues/)).toBeNull())
  })

  it('guards enabling without attributes', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    openModal()
    await screen.findByText('Color')

    // The enable button is disabled without a selection; the guard still reports.
    const enable = enableButton()
    enable.removeAttribute('disabled')
    fireEvent.click(enable)
    await screen.findByText('variants.addAttributeFirst')
    expect(convertToConfigurableMock).not.toHaveBeenCalled()
  })

  it('reports conversion failures', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    const onSaved = vi.fn()
    render(<VariantSettingsModal productId="1" isOpen onClose={() => {}} onSaved={onSaved} />)
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: /Color/ }))

    convertToConfigurableMock.mockResolvedValueOnce({ success: false, error: 'taken' })
    fireEvent.click(enableButton())
    await screen.findByText('taken')
    expect(onSaved).not.toHaveBeenCalled()

    convertToConfigurableMock.mockResolvedValueOnce({ success: false, error: undefined })
    fireEvent.click(enableButton())
    await screen.findByText('errors.generic')

    convertToConfigurableMock.mockRejectedValueOnce(new Error('down'))
    fireEvent.click(enableButton())
    await vi.waitFor(() => expect(screen.getAllByText('errors.generic').length).toBeGreaterThan(0))
  })

  it('shows the converting state', async () => {
    getAttributesMock.mockResolvedValueOnce(attrs)
    let resolveConvert!: (value: { success: boolean; error: string | undefined }) => void
    convertToConfigurableMock.mockImplementationOnce(
      () => new Promise<{ success: boolean; error: string | undefined }>((resolve) => (resolveConvert = resolve)),
    )
    const onSaved = vi.fn()
    render(<VariantSettingsModal productId="1" isOpen onClose={() => {}} onSaved={onSaved} />)
    await screen.findByText('Color')

    fireEvent.click(screen.getByRole('button', { name: /Color/ }))
    fireEvent.click(enableButton())
    await vi.waitFor(() => expect(convertToConfigurableMock).toHaveBeenCalled())
    // The deferred conversion keeps the loading state visible.
    expect(screen.getByText('common.loading')).toBeDefined()
    resolveConvert({ success: true, error: undefined })
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
  })
})
