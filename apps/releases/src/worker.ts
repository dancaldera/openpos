/** Cloudflare Workers entry point: serves the release feed from the R2 binding. */

import { type R2BucketLike, r2Reader } from './r2.js'
import { createReleasesApp } from './routes.js'

export interface ReleasesEnv {
  RELEASES_BUCKET: R2BucketLike
}

let cached: { bucket: R2BucketLike; app: ReturnType<typeof createReleasesApp>['app'] } | null = null

export default {
  fetch(request: Request, env: ReleasesEnv): Response | Promise<Response> {
    if (!cached || cached.bucket !== env.RELEASES_BUCKET) {
      cached = { bucket: env.RELEASES_BUCKET, app: createReleasesApp(r2Reader(env.RELEASES_BUCKET)).app }
    }
    return cached.app.fetch(request, env)
  },
}
