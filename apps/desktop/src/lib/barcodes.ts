export function normalizeBarcode(barcode?: string | null): string | undefined {
  if (!barcode) {
    return undefined
  }

  const normalized = barcode
    .trim()
    .replace(/[\r\n\t]+/g, '')
    .replace(/\s+/g, '')

  return normalized.length > 0 ? normalized : undefined
}

export function formatBarcodeForStorage(barcode?: string | null): string | undefined {
  const trimmed = barcode?.trim()
  return trimmed ? trimmed : undefined
}

export function isNormalizedBarcodeEqual(a?: string | null, b?: string | null): boolean {
  return normalizeBarcode(a) === normalizeBarcode(b)
}
