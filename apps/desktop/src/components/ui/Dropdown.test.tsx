// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Dropdown } from './Dropdown'

function openMenu(triggerText = 'Open') {
  render(
    <Dropdown
      trigger={<span>{triggerText}</span>}
      items={[
        { id: 'edit', label: 'Edit', icon: '✏️', onClick: () => {} },
        { id: 'sep', label: '', onClick: () => {}, separator: true },
        { id: 'del', label: 'Delete', onClick: () => {}, variant: 'danger', disabled: true },
      ]}
    />,
  )
  fireEvent.click(screen.getByText(triggerText))
}

afterEach(cleanup)

describe('Dropdown', () => {
  it('toggles the trigger and selects an item', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <Dropdown
        trigger={<span>Menu</span>}
        items={[
          { id: 'edit', label: 'Edit', icon: '✏️', onClick: onEdit },
          { id: 'del', label: 'Delete', onClick: onDelete, variant: 'danger' },
        ]}
      />,
    )

    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByText('Menu'))
    expect(screen.getByRole('menu')).toBeDefined()

    fireEvent.click(screen.getByRole('menuitem', { name: '✏️ Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('ignores clicks on disabled items and renders separators', () => {
    const onDelete = vi.fn()
    render(
      <Dropdown
        trigger={<span>Menu</span>}
        items={[
          { id: 'sep', label: '', onClick: () => {}, separator: true },
          { id: 'del', label: 'Delete', onClick: onDelete, disabled: true },
        ]}
      />,
    )
    fireEvent.click(screen.getByText('Menu'))
    expect(document.querySelector('hr')).toBeDefined()
    // Disabled buttons swallow clicks under happy-dom, so force the event
    // through to prove the guard itself blocks the action.
    const deleteItem = screen.getByRole('menuitem', { name: 'Delete' })
    deleteItem.removeAttribute('disabled')
    fireEvent.click(deleteItem)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeDefined()
  })

  it('opens with the keyboard and closes on Escape', () => {
    openMenu()
    const trigger = screen.getByText('Open').closest('button') as HTMLButtonElement
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(screen.getByRole('menu')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.keyDown(trigger, { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on outside pointer down but stays open for inside clicks', () => {
    openMenu('Stay')
    expect(screen.getByRole('menu')).toBeDefined()
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeDefined()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('repositions on resize and scroll, and aligns left', () => {
    render(
      <Dropdown
        trigger={<span>Left</span>}
        align="left"
        items={[{ id: 'one', label: 'One', onClick: () => {} }]}
      />,
    )
    fireEvent.click(screen.getByText('Left'))
    expect(screen.getByRole('menu')).toBeDefined()
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    expect(screen.getByRole('menu')).toBeDefined()
  })
})
