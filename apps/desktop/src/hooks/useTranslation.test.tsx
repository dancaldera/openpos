// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { useTranslation } from './useTranslation'

type Translation = ReturnType<typeof useTranslation>

afterEach(cleanup)

describe('useTranslation', () => {
  it('exposes the translation service', async () => {
    let captured: Translation | null = null
    function Probe() {
      captured = useTranslation()
      return null
    }
    render(<Probe />)

    expect(captured).not.toBeNull()
    // The expect above guards at runtime; the cast defeats narrowing (tsc
    // cannot see the assignment inside the rendered probe).
    const t = captured as unknown as Translation
    await t.setLocale('en')
    expect(t.getCurrentLocale()).toBe('en')
    expect(t.getSupportedLocales().map((locale) => locale.code)).toEqual(['en', 'es'])
    expect(typeof t.t('missing.key')).toBe('string')
  })
})
