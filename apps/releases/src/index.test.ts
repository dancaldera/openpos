import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logStartup, resolvePort, startServer } from './index.js'

const savedEnv = { ...process.env }

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, savedEnv)
  vi.restoreAllMocks()
})

describe('resolvePort', () => {
  it('reads PORT from an explicit env', () => {
    expect(resolvePort({ PORT: '4000' })).toBe(4000)
    expect(resolvePort({})).toBe(3100)
  })

  it('defaults to the process environment', () => {
    process.env.PORT = '4001'
    expect(resolvePort()).toBe(4001)

    delete process.env.PORT
    expect(resolvePort()).toBe(3100)
  })
})

describe('logStartup', () => {
  it('logs the address and routes', () => {
    logStartup({ port: 3100 })

    expect(console.log).toHaveBeenCalledWith('[Releases] Server running at http://localhost:3100')
    expect(console.log).toHaveBeenCalledTimes(5)
  })
})

describe('startServer', () => {
  it('fails fast without bucket credentials', async () => {
    // Empty strings (not deletions): loadLocalEnv only fills undefined keys,
    // so this also proves the local .env file cannot rescue a blank config.
    process.env.BUCKET = ''
    process.env.AWS_S3_BUCKET = ''
    process.env.ACCESS_KEY_ID = ''
    process.env.AWS_ACCESS_KEY_ID = ''
    process.env.SECRET_ACCESS_KEY = ''
    process.env.AWS_SECRET_ACCESS_KEY = ''

    await expect(startServer(0)).rejects.toThrow('Missing bucket configuration')
  })

  it('serves health checks on an ephemeral port', async () => {
    process.env.BUCKET = 'bucket-start'
    process.env.ACCESS_KEY_ID = 'key-id'
    process.env.SECRET_ACCESS_KEY = 'secret'

    const server = await startServer(0)
    try {
      const address = server.address()
      expect(address).toMatchObject({ port: expect.any(Number) })
      const port = (address as { port: number }).port
      expect(port).not.toBe(0)

      const res = await fetch(`http://localhost:${port}/health`)
      expect(res.status).toBe(200)
      expect((await res.json()) as { status: string }).toMatchObject({ status: 'ok' })
      expect(console.log).toHaveBeenCalledWith(`[Releases] Server running at http://localhost:${port}`)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
