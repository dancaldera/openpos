/**
 * Web stub for @tauri-apps/plugin-opener
 *
 * Aliased in vite.web.config.ts.
 */

export async function open(url: string): Promise<void> {
  // On web, just use the browser's native open
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function openPath(_path: string): Promise<void> {
  console.warn('[stub] openPath() is not supported in web context')
}
