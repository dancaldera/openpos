/** Same strength policy used by sign-up and user management flows. */
function validatePasswordStrength(password) {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character'
  return null
}

/** Optional tablet sign-in PIN: exactly six digits. */
function validatePin(pin) {
  if (!/^\d{6}$/.test(pin)) return 'PIN must be exactly 6 digits'
  return null
}

function normalizeBarcode(barcode) {
  if (!barcode) {
    return undefined
  }

  const normalized = barcode
    .trim()
    .replace(/[\r\n\t]+/g, '')
    .replace(/\s+/g, '')

  return normalized.length > 0 ? normalized : undefined
}

function formatBarcodeForStorage(barcode) {
  const trimmed = barcode?.trim()
  return trimmed ? trimmed : undefined
}

/** Null-returning variants for SQL parameter binding on the API side. */
function normalizeBarcodeOrNull(barcode) {
  return normalizeBarcode(barcode) ?? null
}

function formatBarcodeForStorageOrNull(barcode) {
  return formatBarcodeForStorage(barcode) ?? null
}

// Named shorthand exports (not spreads of require() results) so Node's ESM
// interop can statically detect them when imported from ES modules.
module.exports = {
  validatePasswordStrength,
  validatePin,
  normalizeBarcode,
  formatBarcodeForStorage,
  normalizeBarcodeOrNull,
  formatBarcodeForStorageOrNull,
}
