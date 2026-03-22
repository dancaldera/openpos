# OpenPOS Desktop Web Deployment

This app supports two build targets:

- Electron desktop packaging for downloadable binaries
- Browser deployment for the renderer UI

## Vercel

Use Vercel only for the browser deployment.

- Root Directory: `apps/desktop`
- Framework Preset: `Vite`
- Install Command: `bun install`
- Build Command: `bun run build:web`
- Output Directory: `dist-web`

Set `VITE_API_URL` in the Vercel project to your deployed API base URL.

Example:

```bash
VITE_API_URL=https://your-api.example.com
```

On the API deployment, set `ALLOWED_ORIGIN` to the exact desktop web app origin so browser requests pass CORS.

## Local Verification

```bash
bun run build:web
```
