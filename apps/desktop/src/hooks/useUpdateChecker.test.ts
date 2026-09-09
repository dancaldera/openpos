import { describe, expect, it } from 'vitest'
import { useUpdateChecker } from './useUpdateChecker'
import { updateAvailable, updateVersion } from '../stores/update/updateStore'

describe('useUpdateChecker', () => {
  it('exposes update state and actions', () => {
    updateAvailable.value = true
    updateVersion.value = '1.2.3'

    const checker = useUpdateChecker()

    expect(checker.hasUpdate).toBe(true)
    expect(checker.updateAvailable).toBe(true)
    expect(checker.updateVersion).toBe('1.2.3')
    expect(typeof checker.checkForUpdate).toBe('function')
    expect(typeof checker.downloadAndInstall).toBe('function')
    expect(typeof checker.dismissUpdate).toBe('function')
    expect(typeof checker.clearError).toBe('function')

    updateAvailable.value = false
    updateVersion.value = null
  })
})
