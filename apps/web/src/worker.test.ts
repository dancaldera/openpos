import { describe, expect, it, vi } from 'vitest'
import worker, { isApiPath } from './worker.ts'

function env() {
  return {
    API: {
      fetch: vi.fn(async (request: Request) =>
        Response.json({
          host: request.headers.get('x-forwarded-host'),
          url: request.url,
          method: request.method,
          body: await request.text(),
        }),
      ),
    },
    ASSETS: { fetch: vi.fn(async (request: Request) => new Response(`asset ${new URL(request.url).pathname}`)) },
  }
}

describe('web worker', () => {
  it('forwards /api to the API with the store host', async () => {
    const e = env()
    const response = await worker.fetch(
      new Request('https://demo.pos.example.com/api/auth/login', { method: 'POST', body: '{"pin":"1234"}' }),
      e,
    )
    expect(await response.json()).toEqual({
      host: 'demo.pos.example.com',
      url: 'https://demo.pos.example.com/api/auth/login',
      method: 'POST',
      body: '{"pin":"1234"}',
    })
    expect(e.ASSETS.fetch).not.toHaveBeenCalled()
  })

  it('serves everything else from static assets and ignores the execution context', async () => {
    const e = env()
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} }
    const handler = worker.fetch as (request: Request, env: unknown, ctx: unknown) => Promise<Response>
    const response = await handler(new Request('https://aldo.pos.example.com/products'), e, ctx)
    expect(await response.text()).toBe('asset /products')
    expect(e.API.fetch).not.toHaveBeenCalled()
  })

  it('matches only the /api prefix', () => {
    expect(isApiPath('/api')).toBe(true)
    expect(isApiPath('/api/health')).toBe(true)
    expect(isApiPath('/apis')).toBe(false)
  })
})
