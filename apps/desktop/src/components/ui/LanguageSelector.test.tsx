// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { changeLanguage } = vi.hoisted(() => ({
  changeLanguage: vi.fn(async () => {}),
}))

vi.mock('../../stores/language/languageActions', () => ({
  languageActions: { changeLanguage },
}))

const { LanguageSelector } = await import('./LanguageSelector')

afterEach(() => {
  cleanup()
  changeLanguage.mockClear()
})

describe('LanguageSelector', () => {
  it('lists supported locales and changes language', () => {
    render(<LanguageSelector />)

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options.length).toBe(2)

    fireEvent.change(select, { target: { value: 'es' } })
    expect(changeLanguage).toHaveBeenCalledWith('es')
  })

  it('ignores empty selections', () => {
    render(<LanguageSelector />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(changeLanguage).not.toHaveBeenCalled()
  })
})
