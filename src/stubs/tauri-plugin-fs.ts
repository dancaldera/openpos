/**
 * Web stub for @tauri-apps/plugin-fs.
 *
 * Runtime config file access is Tauri-only, so this should never execute in web.
 */

export { BaseDirectory } from './tauri-api-path'

export async function readTextFile(_path: string, _options?: { baseDir?: number }): Promise<string> {
  throw new Error('[stub] readTextFile() called in web context — this should never happen')
}
