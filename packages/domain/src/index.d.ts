export function validatePasswordStrength(password: string): string | null

export function validatePin(pin: string): string | null

export function normalizeBarcode(barcode?: string | null): string | undefined

export function formatBarcodeForStorage(barcode?: string | null): string | undefined

export function normalizeBarcodeOrNull(barcode?: string | null): string | null

export function formatBarcodeForStorageOrNull(barcode?: string | null): string | null
