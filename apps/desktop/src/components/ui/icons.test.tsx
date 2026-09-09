// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/preact'
import * as icons from './icons'
import { EyeIcon, EyeOffIcon } from './icons'

afterEach(cleanup)

describe('icons', () => {
  it('renders every icon', () => {
    const components = Object.values(icons).filter(
      (value): value is (props: { class?: string }) => null => typeof value === 'function',
    )
    expect(components.length).toBeGreaterThan(10)

    const { container } = render(
      <div>
        {components.map((Icon, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: test-only render
          <span key={index} data-testid="icon">
            <Icon class="icon" />
          </span>
        ))}
      </div>,
    )
    expect(container.querySelectorAll('svg').length).toBe(components.length)
  })

  it('labels eye icons accessibly', () => {
    const { rerender } = render(<EyeIcon aria-label="Show" />)
    expect(document.querySelector('title')?.textContent).toBe('Show')

    rerender(<EyeOffIcon aria-label="Hide" />)
    expect(document.querySelector('title')?.textContent).toBe('Hide')

    rerender(<EyeIcon />)
    expect(document.querySelector('title')?.textContent).toBe('Show')

    rerender(<EyeOffIcon />)
    expect(document.querySelector('title')?.textContent).toBe('Hide')
  })
})
