// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Form } from './Form'

afterEach(cleanup)

describe('Form', () => {
  it('prevents default submit and forwards the event', () => {
    const onSubmit = vi.fn()
    render(
      <Form onSubmit={onSubmit} spacing="lg">
        <button type="submit">Go</button>
      </Form>,
    )

    const form = screen.getByRole('button', { name: 'Go' }).closest('form') as HTMLFormElement
    expect(form.className).toContain('space-y-6')
    fireEvent.submit(form)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('uses medium spacing by default', () => {
    render(
      <Form>
        <button type="submit">Go</button>
      </Form>,
    )

    const form = screen.getByRole('button', { name: 'Go' }).closest('form') as HTMLFormElement
    expect(form.className).toContain('space-y-4')
    expect(() => fireEvent.submit(form)).not.toThrow()
  })

  it('submits without a handler and honors spacing', () => {
    render(
      <Form spacing="sm">
        <button type="submit">Go</button>
      </Form>,
    )

    const form = screen.getByRole('button', { name: 'Go' }).closest('form') as HTMLFormElement
    expect(form.className).toContain('space-y-3')
    expect(() => fireEvent.submit(form)).not.toThrow()
  })
})
