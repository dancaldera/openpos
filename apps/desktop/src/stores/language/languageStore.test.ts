import { describe, expect, it } from 'vitest'
import { languageStore } from './languageStore'

describe('languageStore', () => {
  it('defaults to english', () => {
    expect(languageStore.currentLocale.value).toBe('en')
    expect(languageStore.isLoading.value).toBe(false)
    expect(languageStore.availableLocales.value).toEqual(['en', 'es'])
  })
})
