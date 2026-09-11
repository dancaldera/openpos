// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/preact'
import type { RefObject } from 'preact'
import { useRef } from 'preact/hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useClickOutside } from './useClickOutside'

afterEach(cleanup)

function Probe({ handler, externalRef }: { handler: () => void; externalRef?: RefObject<HTMLDivElement> }) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(externalRef ?? ref, handler)
  return (
    <div>
      <div ref={externalRef ?? ref} data-testid="inside">
        inside
      </div>
      <div data-testid="outside">outside</div>
    </div>
  )
}

describe('useClickOutside', () => {
  it('fires only for outside clicks', () => {
    const handler = vi.fn()
    const { getByTestId } = render(<Probe handler={handler} />)

    fireEvent.mouseDown(getByTestId('inside'))
    expect(handler).not.toHaveBeenCalled()

    fireEvent.mouseDown(getByTestId('outside'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('ignores events without a mounted node and cleans up on unmount', () => {
    const handler = vi.fn()
    function DanglingProbe() {
      useClickOutside({ current: null }, handler)
      return <div data-testid="outside">outside</div>
    }
    const { getByTestId, unmount } = render(<DanglingProbe />)
    const outside = getByTestId('outside')

    fireEvent.mouseDown(outside)
    expect(handler).not.toHaveBeenCalled()

    unmount()
    fireEvent.mouseDown(document.body)
    expect(handler).not.toHaveBeenCalled()
  })
})
