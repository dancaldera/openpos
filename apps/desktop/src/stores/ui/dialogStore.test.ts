import { describe, expect, it } from 'vitest'
import { openFullSizeDialogCount, registerFullSizeDialog } from './dialogStore'

describe('dialogStore', () => {
  it('counts open full-size dialogs without going negative', () => {
    const closeFirst = registerFullSizeDialog()
    const closeSecond = registerFullSizeDialog()
    expect(openFullSizeDialogCount.value).toBe(2)

    closeFirst()
    expect(openFullSizeDialogCount.value).toBe(1)

    closeSecond()
    closeSecond()
    expect(openFullSizeDialogCount.value).toBe(0)
  })
})
