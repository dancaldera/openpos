/**
 * Shared web client for every store. Static assets come from the desktop web
 * build; /api is forwarded to the API Worker over a service binding with the
 * original host, which is how the API picks the store.
 */

interface FetcherLike {
  fetch(request: Request): Promise<Response>
}

export interface WebEnv {
  API: FetcherLike
  ASSETS: FetcherLike
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

export async function handleRequest(request: Request, env: WebEnv): Promise<Response> {
  const url = new URL(request.url)
  if (isApiPath(url.pathname)) {
    const headers = new Headers(request.headers)
    headers.set('X-Forwarded-Host', url.host)
    return env.API.fetch(new Request(request, { headers }))
  }
  return env.ASSETS.fetch(request)
}

export default {
  fetch: (request: Request, env: WebEnv) => handleRequest(request, env),
}
