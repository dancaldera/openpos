const path = require('node:path')

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function normalizeImageKey(key) {
  return typeof key === 'string' ? key.trim() : ''
}

function isLegacyLocalImageKey(key) {
  const normalizedKey = normalizeImageKey(key)

  if (!normalizedKey || normalizedKey.includes('/') || normalizedKey.includes('\\')) {
    return false
  }

  return ALLOWED_IMAGE_EXTENSIONS.has(path.extname(normalizedKey).toLowerCase())
}

module.exports = {
  isLegacyLocalImageKey,
}
