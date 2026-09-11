// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog, DialogConfirm } from './Dialog'

afterEach(cleanup)

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Dialog isOpen={false} onClose={() => {}}>
        <p>Hidden</p>
      </Dialog>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title, sizes, and closes via the X button', () => {
    const onClose = vi.fn()
    for (const size of ['sm', 'md', 'lg', 'xl', 'full'] as const) {
      const { unmount } = render(
        <Dialog isOpen onClose={onClose} title={`Title ${size}`} size={size}>
          <p>Body {size}</p>
        </Dialog>,
      )
      expect(screen.getByText(`Title ${size}`)).toBeDefined()
      expect(screen.getByText(`Body ${size}`)).toBeDefined()
      unmount()
      cleanup()
    }

    render(
      <Dialog isOpen onClose={onClose} title="Closable">
        <p>Body</p>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    const closeButton = dialog.querySelector('button')
    fireEvent.click(closeButton as HTMLButtonElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders without a title', () => {
    render(
      <Dialog isOpen onClose={() => {}}>
        <p>No title body</p>
      </Dialog>,
    )
    expect(screen.getByText('No title body')).toBeDefined()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('closes on Escape and on backdrop click', () => {
    const onClose = vi.fn()
    render(
      <Dialog isOpen onClose={onClose} title="Esc">
        <p>Body</p>
      </Dialog>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Close dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps open on backdrop click when outside click is disabled', () => {
    const onClose = vi.fn()
    render(
      <Dialog isOpen onClose={onClose} title="Locked" closeOnOutsideClick={false}>
        <p>Body</p>
      </Dialog>,
    )
    fireEvent.click(screen.getByLabelText('Close dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('DialogConfirm', () => {
  it('confirms and cancels with defaults', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<DialogConfirm isOpen onClose={onClose} onConfirm={onConfirm} message="Sure?" />)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('renders custom texts and the danger variant', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(
      <DialogConfirm
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Wipe"
        message="Really?"
        confirmText="Wipe it"
        cancelText="Keep"
        variant="danger"
      />,
    )
    expect(screen.getByText('Wipe')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Wipe it' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <DialogConfirm isOpen={false} onClose={() => {}} onConfirm={() => {}} message="Hidden" />,
    )
    expect(container.innerHTML).toBe('')
  })
})
