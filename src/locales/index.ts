export { default as de } from './de.json'
export { default as en } from './en.json'
export { default as es } from './es.json'
export { default as fr } from './fr.json'
export { default as it } from './it.json'
export { default as ja } from './ja.json'
export { default as pt } from './pt.json'
export { default as zh } from './zh.json'

export const AVAILABLE_LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja'] as const

export type LocaleCode = (typeof AVAILABLE_LOCALES)[number]
