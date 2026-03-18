/**
 * Web stub for @tauri-apps/plugin-updater
 *
 * This file is aliased in vite.web.config.ts to replace the real plugin
 * in the web build. All update functionality is guarded by isTauri checks
 * before reaching these stubs, so they should never be called.
 */

export interface Update {
  version: string
  downloadAndInstall: () => Promise<void>
}

export async function check(_options?: unknown): Promise<Update | null> {
  throw new Error('[stub] updater.check() called in web context — this should never happen')
}
