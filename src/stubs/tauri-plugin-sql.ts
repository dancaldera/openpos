/**
 * Web stub for @tauri-apps/plugin-sql
 *
 * Aliased in vite.web.config.ts. The plugin-sql package is only used via
 * dynamic import inside isTauri guards, so this stub mainly satisfies any
 * static type imports that might leak through.
 */

const Database = {
  load: async (_path: string) => {
    throw new Error('[stub] @tauri-apps/plugin-sql not available in web context')
  },
}

export default Database
