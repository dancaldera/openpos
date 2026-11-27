// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClickableRows, ROW_PRIMARY_CLASS } from './ClickableRows'

afterEach(() => {
  cleanup()
  window.getSelection()?.removeAllRanges()
})

function renderTable({
  onOpen,
  onOther,
  isDisabled = false,
}: {
  onOpen: () => void
  onOther?: () => void
  isDisabled?: boolean
}) {
  render(
    <ClickableRows>
      <table>
        <tbody>
          <tr>
            <td>
              <button type="button" className={ROW_PRIMARY_CLASS} disabled={isDisabled} onClick={onOpen}>
                Open order
              </button>
            </td>
            <td>Pending</td>
            <td>
              <button type="button" onClick={onOther}>
                More
              </button>
            </td>
          </tr>
          <tr>
            <td>No primary here</td>
          </tr>
        </tbody>
      </table>
    </ClickableRows>,
  )
}

describe('ClickableRows', () => {
  it('opens the row when its empty space is clicked', () => {
    const onOpen = vi.fn()
    renderTable({ onOpen })

    fireEvent.click(screen.getByText('Pending'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('leaves other controls in the row alone', () => {
    const onOpen = vi.fn()
    const onOther = vi.fn()
    renderTable({ onOpen, onOther })

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(onOther).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does nothing for disabled primaries, rows without one, or non-primary buttons', () => {
    const onOpen = vi.fn()
    renderTable({ onOpen, isDisabled: true })

    fireEvent.click(screen.getByText('Pending'))
    fireEvent.click(screen.getByText('No primary here'))
    fireEvent.click(screen.getByText('Pending'), { button: 2 })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('keeps text selections instead of navigating', () => {
    const onOpen = vi.fn()
    renderTable({ onOpen })
    const cell = screen.getByText('Pending')
    const range = document.createRange()
    range.selectNodeContents(cell)
    window.getSelection()?.addRange(range)

    fireEvent.click(cell)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
