/**
 * OpenPOS Releases Service (Node server)
 *
 * Public proxy in front of the private, S3-compatible releases bucket
 * (Cloudflare R2 through its S3 API). Production runs src/worker.ts with an R2
 * binding instead; both share the routes in src/routes.ts.
 *
 * Environment:
 *   BUCKET            bucket name
 *   ACCESS_KEY_ID     S3 access key id
 *   SECRET_ACCESS_KEY S3 secret access key
 *   REGION            S3 region ("auto" for R2)
 *   ENDPOINT          S3 endpoint (https://<account-id>.r2.cloudflarestorage.com)
 *   PORT              HTTP port (default 3100)
 *
 * Local runs also load `apps/releases/.env` when that file exists.
 */

import { createReleasesApp, handleError } from './routes.js'
import { getObject } from './s3.js'

const releases = createReleasesApp((key) => getObject(key))

export const app = releases.app
export const serveArtifact = releases.serveArtifact
export { handleError }

export default app
