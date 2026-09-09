// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Pagination } from './Pagination'

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const base = {
  totalCount: 100,
  pageSize: 10,
  isLoading: false,
}

afterEach(cleanup)

describe('Pagination', () => {
  it('renders nothing when there is a single page', () => {
    const { container } = render(<Pagination currentPage={1} totalPages={1} onPageChange={() => {}} {...base} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders all pages when there are few and navigates', () => {
    const onPageChange = vi.fn()
    render(<Pagination currentPage={1} totalPages={3} onPageChange={onPageChange} {...base} />)

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(onPageChange).toHaveBeenCalledWith(2)

    fireEvent.click(screen.getByRole('button', { name: 'pagination.next' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
    // Previous is disabled on the first page
    expect(screen.getByRole('button', { name: 'pagination.previous' }).hasAttribute('disabled')).toBe(true)
  })

  it('disables next on the last page', () => {
    const onPageChange = vi.fn()
    render(<Pagination currentPage={5} totalPages={5} onPageChange={onPageChange} {...base} totalCount={47} />)
    expect(screen.getByRole('button', { name: 'pagination.next' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'pagination.previous' }))
    expect(onPageChange).toHaveBeenCalledWith(4)
  })

  it('renders ellipsis windows for many pages', () => {
    const onPageChange = vi.fn()
    // Middle: leading 1 + ellipsis, trailing ellipsis + last
    const { unmount } = render(
      <Pagination currentPage={5} totalPages={10} onPageChange={onPageChange} {...base} />,
    )
    expect(screen.getByRole('button', { name: '1' })).toBeDefined()
    expect(screen.getByRole('button', { name: '10' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '6' }))
    expect(onPageChange).toHaveBeenCalledWith(6)
    unmount()

    // Near the start: no leading ellipsis, trailing ellipsis
    render(<Pagination currentPage={2} totalPages={10} onPageChange={onPageChange} {...base} />)
    expect(screen.getByRole('button', { name: '10' })).toBeDefined()
  })

  it('renders a trailing range without ellipsis when near the end', () => {
    const onPageChange = vi.fn()
    render(<Pagination currentPage={9} totalPages={10} onPageChange={onPageChange} {...base} />)
    expect(screen.getByRole('button', { name: '10' })).toBeDefined()
    expect(screen.getByRole('button', { name: '1' })).toBeDefined()
  })

  it('disables every button while loading', () => {
    render(<Pagination currentPage={2} totalPages={3} onPageChange={() => {}} {...base} isLoading />)
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('works without the loading flag', () => {
    const onPageChange = vi.fn()
    render(<Pagination currentPage={1} totalPages={2} onPageChange={onPageChange} totalCount={20} pageSize={10} />)
    fireEvent.click(screen.getByRole('button', { name: 'pagination.next' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('skips ellipsis markers at the window edges', () => {
    const onPageChange = vi.fn()
    // End of the window touches the last page: no trailing ellipsis.
    const { unmount } = render(
      <Pagination currentPage={1} totalPages={6} onPageChange={onPageChange} totalCount={60} pageSize={10} />,
    )
    expect(screen.getByRole('button', { name: '6' })).toBeDefined()
    unmount()

    // Start of the window touches the first page: no leading ellipsis.
    render(<Pagination currentPage={4} totalPages={6} onPageChange={onPageChange} totalCount={60} pageSize={10} />)
    expect(screen.getByRole('button', { name: '1' })).toBeDefined()
    expect(screen.getByRole('button', { name: '6' })).toBeDefined()
  })
})
