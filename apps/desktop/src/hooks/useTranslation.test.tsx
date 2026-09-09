// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/preact'
import { useTranslation } from './useTranslation'

afterEach(cleanup)

describe('useTranslation', () => {
  it('exposes the translation service', async () => {
    let captured: ReturnType<typeof useTranslation> | null = null
    function Probe() {
      captured = useTranslation()
      return null
    }
    render(<Probe />)

    expect(captured).not.toBeNull()
    await captured?.setLocale('en')
    expect(captured?.getCurrentLocale()).toBe('en')
    expect(captured?.getSupportedLocales().map((locale) => locale.code)).toEqual(['en', 'es'])
    expect(typeof captured?.t('missing.key')).toBe('string')
  })
})
