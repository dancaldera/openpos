import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './worker.js'

function bucket(objects: Record<string, string>) {
  return {
    get: vi.fn(async (key: string) => {
      const value = objects[key]
      if (value === undefined) return null
      const bytes = new TextEncoder().encode(value)
      return { body: new Response(bytes).body as ReadableStream, size: bytes.byteLength }
    }),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('releases worker', () => {
  it('serves the manifest and artifacts from the R2 binding', async () => {
    const env = {
      RELEASES_BUCKET: bucket({
        'releases/latest.json': '{"version":"0.3.11"}',
        'releases/v0.3.11/openpos_amd64.deb': 'deb-bytes',
      }),
    }

    const manifest = await worker.fetch(new Request('https://releases.pos.softmelody.dev/releases/latest.json'), env)
    expect(manifest.status).toBe(200)
    expect(await manifest.json()).toEqual({ version: '0.3.11' })
    expect(manifest.headers.get('content-length')).toBe('20')

    const artifact = await worker.fetch(
      new Request('https://releases.pos.softmelody.dev/v/0.3.11/openpos_amd64.deb'),
      env,
    )
    expect(artifact.status).toBe(200)
    expect(await artifact.text()).toBe('deb-bytes')
    expect(artifact.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')

    const legacy = await worker.fetch(
      new Request('https://releases.pos.softmelody.dev/releases/v/0.3.11/openpos_amd64.deb'),
      env,
    )
    expect(legacy.status).toBe(200)
    expect(env.RELEASES_BUCKET.get).toHaveBeenCalledTimes(3)
  })

  it('returns 404 for missing objects and rebuilds the app when the binding changes', async () => {
    const first = { RELEASES_BUCKET: bucket({}) }
    expect((await worker.fetch(new Request('https://r.test/releases/latest.json'), first)).status).toBe(404)

    const second = { RELEASES_BUCKET: bucket({ 'releases/latest.json': '{}' }) }
    expect((await worker.fetch(new Request('https://r.test/releases/latest.json'), second)).status).toBe(200)
    expect((await worker.fetch(new Request('https://r.test/releases/latest.json'), second)).status).toBe(200)
    expect(second.RELEASES_BUCKET.get).toHaveBeenCalledTimes(2)
  })
})
