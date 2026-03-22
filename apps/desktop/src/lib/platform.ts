/**
 * platform.ts — Runtime Electron/browser detector
 *
 * Use this instead of checking for desktop APIs directly in business logic.
 * The Electron preload exposes a marker on `window` before the renderer app
 * starts, and the web build still hard-codes `VITE_PLATFORM=web` for tree-shaking.
 */
export const isElectron: boolean =
  import.meta.env.VITE_PLATFORM !== 'web' &&
  typeof window !== 'undefined' &&
  Boolean(window.__OPENPOS_DESKTOP__?.isElectron)

export const isDesktop: boolean = isElectron
export const isWeb: boolean = !isDesktop
