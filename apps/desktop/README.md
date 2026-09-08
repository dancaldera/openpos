# OpenPOS Desktop Web Deployment

This app supports two build targets:

- Electron desktop packaging for downloadable binaries
- Browser deployment for the renderer UI

## Railway

The browser UI is the `web` service in the OpenPOS Railway project.

- Dockerfile: `Dockerfile.web`
- Config: `railway.web.json`
- Build-time env: `VITE_API_URL` must be the public API origin, e.g. `https://api-copy-production.up.railway.app`

The API service uses `Dockerfile.api` and `railway.api.json`. Set `JWT_SECRET`, `INTERNAL_SECRET`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` on the API, and set `ALLOWED_ORIGIN` to the web origin (comma-separated if you have more than one). Turso credentials must remain on the API; the web app discovers the store connection key from `/api/connections/assigned`.

## Local Verification

```bash
pnpm run build:web
```
