import { describe, expect, it, mock } from 'bun:test'
import { handleDialogEscape, handleDialogOutsideClick } from './Dialog'

describe('Dialog handlers', () => {
  it('closes on escape while open', () => {
    const onClose = mock(() => {})

    handleDialogEscape({ key: 'Escape' }, true, onClose)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores non-escape keys and closed dialogs', () => {
    const onClose = mock(() => {})

    handleDialogEscape({ key: 'Enter' }, true, onClose)
    handleDialogEscape({ key: 'Escape' }, false, onClose)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on outside click when enabled', () => {
    const onClose = mock(() => {})

    handleDialogOutsideClick(true, onClose)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on outside click when disabled', () => {
    const onClose = mock(() => {})

    handleDialogOutsideClick(false, onClose)

    expect(onClose).not.toHaveBeenCalled()
  })
})
