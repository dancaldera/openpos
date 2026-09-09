// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { FormField } from './FormField'

afterEach(cleanup)

describe('FormField', () => {
  it('renders labels, required marks, errors, and helper text', () => {
    const { rerender } = render(
      <FormField id="name" label="Name" required helperText="Your name">
        <input id="name" />
      </FormField>,
    )

    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('*')).toBeDefined()
    expect(screen.getByText('Your name')).toBeDefined()

    rerender(
      <FormField id="name" label="Name" error="Required">
        <input id="name" />
      </FormField>,
    )
    expect(screen.getByText('Required')).toBeDefined()
    expect(screen.queryByText('Your name')).toBeNull()

    rerender(
      <FormField id="name">
        <input id="name" />
      </FormField>,
    )
    expect(document.querySelector('label')).toBeNull()
  })
})
