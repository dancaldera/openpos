/**
 * Web stub for @tauri-apps/api/core
 *
 * This file is aliased in vite.web.config.ts to replace the real Tauri API
 * package in the web build. All Tauri-specific functionality is guarded by
 * isTauri checks before reaching these stubs, so they should never be called.
 * They are here purely to satisfy the bundler.
 */

export async function invoke<T>(_cmd: string, _args?: Record<string, unknown>): Promise<T> {
  throw new Error('[stub] invoke() called in web context — this should never happen')
}
