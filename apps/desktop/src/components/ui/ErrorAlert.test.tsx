// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { ErrorAlert } from './ErrorAlert'

afterEach(cleanup)

describe('ErrorAlert', () => {
  it('renders the message with alert styling', () => {
    render(<ErrorAlert class="extra">Something broke</ErrorAlert>)

    expect(screen.getByText('Something broke')).toBeDefined()
  })
})
