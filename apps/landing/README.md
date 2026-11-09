# OpenPOS Landing Page

Landing page for [pos.softmelody.dev](https://pos.softmelody.dev) - links to [demo.pos.softmelody.dev](https://demo.pos.softmelody.dev).

Static marketing site built with Astro and Tailwind CSS. No environment variables are required.

## Commands

| Command       | Action                                      |
| :------------ | :------------------------------------------ |
| `pnpm install` | Install dependencies                        |
| `pnpm run dev` | Start dev server at `localhost:4321`        |
| `pnpm run build` | Build production site to `./dist/`        |
| `pnpm run preview` | Preview build locally                    |

## Deployment

Deployed as static assets on the `openpos-landing` Cloudflare Worker
(`wrangler.jsonc`, Custom Domain `pos.softmelody.dev`):

```bash
pnpm run deploy   # astro build && wrangler deploy
```
