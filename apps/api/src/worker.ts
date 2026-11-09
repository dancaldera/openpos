/**
 * Cloudflare Workers entry point.
 *
 * With nodejs_compat (compatibility date 2025-04-01 or later) Workers expose
 * vars and secrets on process.env, so the app reads configuration the same
 * way in Node and in Workers.
 */

import { app } from './app.js'

export default {
  fetch: app.fetch,
}
