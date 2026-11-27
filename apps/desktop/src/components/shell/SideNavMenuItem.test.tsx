// @vitest-environment happy-dom

import { SideNav, SideNavSection } from '@astryxdesign/core/SideNav'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CircleUser } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SideNavMenuItem } from './SideNavMenuItem'

afterEach(cleanup)

describe('SideNavMenuItem', () => {
  it('opens its menu from anywhere on the row and runs the chosen item', () => {
    const signOut = vi.fn()
    render(
      <SideNav aria-label="nav">
        <SideNavSection title="account" isHeaderHidden>
          <SideNavMenuItem
            label="Ana"
            icon={CircleUser}
            endContent={<span>status</span>}
            items={[{ label: 'Sign out', variant: 'destructive', onClick: signOut }]}
          />
        </SideNavSection>
      </SideNav>,
    )

    // One control for the row: no separate options button to hunt for.
    const row = screen.getByRole('button', { name: /Ana/ })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(row.getAttribute('aria-haspopup')).toBe('menu')

    fireEvent.click(screen.getByText('status'))
    expect(row.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
