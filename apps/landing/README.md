# OpenPOS Landing Page

Landing page for [openpos.xyz](https://openpos.xyz) - redirects to [demo.openpos.xyz](https://demo.openpos.xyz).

Static marketing site built with Astro and Tailwind CSS. No environment variables are required.

## Commands

| Command       | Action                                      |
| :------------ | :------------------------------------------ |
| `pnpm install` | Install dependencies                        |
| `pnpm run dev` | Start dev server at `localhost:4321`        |
| `pnpm run build` | Build production site to `./dist/`        |
| `pnpm run preview` | Preview build locally                    |

## Deployment

Built for Vercel as a fully static site. Connect the repo and deploy; `vercel.json` points the build at `pnpm run build` with `dist/` as the output directory.
