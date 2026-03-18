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

/**
 * Stub for Tauri Resource class.
 * Used by plugins like updater. Never instantiated in web context.
 */
export class Resource {
  protected rid: number = 0
}

/**
 * Stub for Tauri Channel class.
 * Used by plugins for bi-directional communication. Never used in web context.
 */
export class Channel<T = unknown> {
  onmessage?: (data: T) => void
  async post(_data: T): Promise<void> {
    throw new Error('[stub] Channel.post() called in web context — this should never happen')
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    throw new Error('[stub] Channel.iterator called in web context — this should never happen')
  }
}
