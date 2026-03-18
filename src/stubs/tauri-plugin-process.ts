/**
 * Web stub for @tauri-apps/plugin-process
 *
 * This file is aliased in vite.web.config.ts to replace the real plugin
 * in the web build. All process functionality is guarded by isTauri checks
 * before reaching these stubs, so they should never be called.
 */

export async function relaunch(): Promise<void> {
  throw new Error('[stub] process.relaunch() called in web context — this should never happen')
}

export async function exit(_code?: number): Promise<void> {
  throw new Error('[stub] process.exit() called in web context — this should never happen')
}
