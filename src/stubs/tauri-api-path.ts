/**
 * Web stub for @tauri-apps/api/path.
 *
 * Runtime config is only used in Tauri, so these should never execute in web.
 */

export enum BaseDirectory {
  AppConfig = 13,
}

export async function appConfigDir(): Promise<string> {
  throw new Error('[stub] appConfigDir() called in web context — this should never happen')
}

export async function join(..._paths: string[]): Promise<string> {
  throw new Error('[stub] join() called in web context — this should never happen')
}
