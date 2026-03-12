export { default as en } from './en.json'
export { default as es } from './es.json'

export const AVAILABLE_LOCALES = ['en', 'es'] as const

export type LocaleCode = (typeof AVAILABLE_LOCALES)[number]
