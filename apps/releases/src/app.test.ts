import { beforeEach, describe, expect, it, vi } from 'vitest'

type GetObjectMock = (key: string) => Promise<{
  key: string
  body: unknown
  contentLength: number | null
} | null>

const getObject = vi.fn<GetObjectMock>(async () => null)

vi.mock('./s3.js', () => ({
  getObject: (key: string) => getObject(key),
}))

const { default: app } = await import('./app.js')

describe('releases service', () => {
  beforeEach(() => {
    getObject.mockClear()
    getObject.mockImplementation(async () => null)
  })

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await app.request('/health')

      expect(res.status).toBe(200)
      const body = (await res.json()) as { status: string }
      expect(body.status).toBe('ok')
    })
  })

  describe('GET /releases/latest.json', () => {
    it('serves the manifest with json content type and short cache', async () => {
      getObject.mockImplementation(async (key) => {
        expect(key).toBe('releases/latest.json')
        return { key, body: new ReadableStream(), contentLength: 42 }
      })

      const res = await app.request('/releases/latest.json')

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')
      expect(res.headers.get('cache-control')).toBe('public, max-age=60')
      expect(res.headers.get('content-length')).toBe('42')
    })

    it('returns 404 when no release has been published yet', async () => {
      const res = await app.request('/releases/latest.json')

      expect(res.status).toBe(404)
    })
  })

  describe('GET /releases/v/:version/:name', () => {
    it('serves the public artifact URL used in latest.json', async () => {
      getObject.mockImplementation(async (key) => {
        expect(key).toBe('releases/v0.0.1/openpos_amd64.deb')
        return { key, body: new ReadableStream(), contentLength: 2048 }
      })

      const res = await app.request('/releases/v/0.0.1/openpos_amd64.deb')

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/vnd.debian.binary-package')
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    })
  })

  describe('GET /v/:version/:name', () => {
    it('streams artifacts with immutable caching and the right content type', async () => {
      getObject.mockImplementation(async (key) => {
        expect(key).toBe('releases/v0.8.4/openpos-x86_64.AppImage')
        return { key, body: new ReadableStream(), contentLength: 1024 }
      })

      const res = await app.request('/v/0.8.4/openpos-x86_64.AppImage')

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/x-executable')
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    })

    it('rejects invalid versions to prevent path traversal', async () => {
      const res = await app.request('/v/../../etc/passwd')

      expect(res.status).toBe(404)
    })

    it('rejects invalid file names', async () => {
      const res = await app.request('/v/0.8.4/bad%2Fname.AppImage')

      expect(res.status).toBe(400)
    })

    it('returns 404 for missing assets', async () => {
      const res = await app.request('/v/0.8.4/openpos-arm64.zip')

      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('openpos-arm64.zip')
    })
  })
})
