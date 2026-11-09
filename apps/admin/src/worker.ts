/** Cloudflare Workers entry point. Vars and secrets arrive as bindings on c.env. */

import { createAdminApp } from './app.tsx'

export default createAdminApp()
