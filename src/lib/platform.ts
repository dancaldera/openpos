/**
 * platform.ts — Runtime Tauri/browser detector
 *
 * Use this instead of checking for Tauri APIs directly in business logic.
 * The `isTauri` flag is set at runtime by detecting the Tauri internals object
 * that Tauri injects into the window before any user code runs.
 *
 * For the web build, the VITE_PLATFORM env var is also checked so that
 * tree-shaking can eliminate dead code at build time.
 */

/**
 * True when running inside a Tauri desktop window.
 * False when running as a plain web app in a browser.
 */
export const isTauri: boolean =
  import.meta.env.VITE_PLATFORM !== 'web' &&
  typeof window !== 'undefined' &&
  // Tauri v2 sets __TAURI_INTERNALS__ on the window object
  !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__

/**
 * True when running as a plain web app (browser, Vercel, etc.)
 */
export const isWeb: boolean = !isTauri
