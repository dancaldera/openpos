import { signal } from '@preact/signals-react'

/**
 * Hash-based routing (`#/orders/new`). It works the same under Electron's
 * `file://` origin and on the web, and keeps back/forward working in both.
 *
 * Routes are slash-separated paths without a leading slash: `orders`,
 * `orders/new`, `orders/<id>`, `orders/<id>/edit`.
 */
export const DEFAULT_ROUTE = 'dashboard'

function readHash(): string {
  if (typeof window === 'undefined') return DEFAULT_ROUTE
  const raw = window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '')
  return raw ? decodeURIComponent(raw) : DEFAULT_ROUTE
}

export const currentPath = signal<string>(readHash())

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    currentPath.value = readHash()
  })
}

/** Href for a route, usable on Astryx `href` props and plain anchors. */
export function hrefFor(path: string): string {
  return `#/${path}`
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const normalized = path.replace(/^#?\/?/, '') || DEFAULT_ROUTE
  if (typeof window !== 'undefined') {
    const target = hrefFor(normalized)
    if (options.replace) {
      window.history.replaceState(null, '', target)
    } else if (window.location.hash !== target) {
      window.location.hash = target
    }
  }
  currentPath.value = normalized
}

export interface Route {
  /** Full path, e.g. `orders/abc/edit`. */
  path: string
  /** Top-level section, e.g. `orders`. */
  section: string
  /** Remaining segments, e.g. `['abc', 'edit']`. */
  params: string[]
}

export function parseRoute(path: string): Route {
  const [section = DEFAULT_ROUTE, ...params] = path.split('/').filter(Boolean)
  return { path, section, params }
}

export function useRoute(): Route {
  return parseRoute(currentPath.value)
}
