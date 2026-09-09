import { describe, expect, it } from 'vitest'
import {
  hasUpdate,
  isChecking,
  isDownloading,
  isInstalling,
  isUpdating,
  updateAvailable,
  updateVersion,
} from './updateStore'

describe('updateStore', () => {
  it('derives update flags from signals', () => {
    expect(hasUpdate.value).toBe(false)
    expect(isUpdating.value).toBe(false)

    updateAvailable.value = true
    expect(hasUpdate.value).toBe(false)

    updateVersion.value = '1.2.3'
    expect(hasUpdate.value).toBe(true)

    isChecking.value = true
    expect(isUpdating.value).toBe(true)
    isChecking.value = false

    isDownloading.value = true
    expect(isUpdating.value).toBe(true)
    isDownloading.value = false

    isInstalling.value = true
    expect(isUpdating.value).toBe(true)
    isInstalling.value = false

    expect(isUpdating.value).toBe(false)
    updateAvailable.value = false
    updateVersion.value = null
  })
})
