// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table'

afterEach(cleanup)

describe('Table', () => {
  it('renders head, headers, and plain cells', () => {
    render(
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Price</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Apple</TableCell>
            <TableCell>$1.00</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )

    expect(screen.getByText('Apple')).toBeDefined()
    expect(screen.getByText('$1.00')).toBeDefined()
    expect(screen.getByText('Name').tagName).toBe('TH')
  })

  it('supports bleed, dense, grid, and striped variants', () => {
    const { container } = render(
      <Table bleed dense grid striped class="custom">
        <TableBody>
          <TableRow class="row">
            <TableHeader>Head</TableHeader>
          </TableRow>
          <TableRow href="/orders/1" title="Order 1">
            <TableCell colSpan={2}>Linked</TableCell>
            <TableCell>Second</TableCell>
          </TableRow>
          <TableRow href="/orders/2" target="_blank" title="Order 2">
            <TableCell>External</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )

    const links = container.querySelectorAll('a[aria-label]')
    expect(links).toHaveLength(3)
    expect(screen.getByText('Linked')).toBeDefined()
    // First cell of a linked row is tabbable, the rest are skipped
    const tabIndexes = Array.from(links).map((link) => link.getAttribute('tabindex'))
    expect(tabIndexes).toContain('0')
    expect(tabIndexes).toContain('-1')
  })

  it('renders unlinked rows without overlays', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Plain</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(container.querySelector('a')).toBeNull()
  })
})
