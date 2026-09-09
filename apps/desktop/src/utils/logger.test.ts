import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logError, logger, logServiceError } from './logger'

describe('logger', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

  beforeEach(() => {
    logger.clearLogs()
    errorSpy.mockClear()
    warnSpy.mockClear()
    infoSpy.mockClear()
    debugSpy.mockClear()
  })

  afterEach(() => {
    logger.clearLogs()
  })

  it('logs errors from Error instances', () => {
    logger.error('auth', new Error('bad credentials'))

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [prefix, message] = errorSpy.mock.calls[0] as [string, string]
    expect(prefix).toContain('[ERROR]')
    expect(prefix).toContain('[auth]')
    expect(message).toBe('bad credentials')
    expect(logger.getLogs()).toHaveLength(1)
    expect(logger.getLogs()[0]).toMatchObject({ level: 'error', context: 'auth', message: 'bad credentials' })
  })

  it('logs errors from strings and unknown values', () => {
    logger.error('sync', 'plain failure')
    logger.error('sync', 42)

    expect(logger.getLogs().map((entry) => entry.message)).toEqual(['plain failure', 'An unknown error occurred'])
  })

  it('stores optional data on error entries', () => {
    logger.error('orders', new Error('nope'), { orderId: '1' })

    expect(logger.getLogs()[0]?.data).toEqual({ orderId: '1' })
    expect(errorSpy.mock.calls[0]?.[2]).toEqual({ orderId: '1' })
  })

  it('logs warnings, info, and debug messages', () => {
    logger.warn('sync', 'slow connection')
    logger.info('app', 'started')
    logger.debug('app', 'verbose detail')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(logger.getLogs().map((entry) => entry.level)).toEqual(['warn', 'info', 'debug'])
  })

  it('skips debug output when not in development', () => {
    const loggerAny = logger as unknown as { isDevelopment: boolean }
    const previous = loggerAny.isDevelopment
    loggerAny.isDevelopment = false
    try {
      logger.debug('app', 'hidden detail')

      expect(debugSpy).not.toHaveBeenCalled()
      expect(logger.getLogs()).toHaveLength(0)
    } finally {
      loggerAny.isDevelopment = previous
    }
  })

  it('caps stored logs at 1000 entries', () => {
    for (let i = 0; i < 1005; i++) {
      logger.info('stress', `message ${i}`)
    }

    const logs = logger.getLogs()
    expect(logs).toHaveLength(1000)
    expect(logs[0]?.message).toBe('message 5')
    expect(logs[999]?.message).toBe('message 1004')
  })

  it('returns a copy from getLogs and exports JSON', () => {
    logger.warn('sync', 'wobble')

    const copy = logger.getLogs()
    copy.length = 0
    expect(logger.getLogs()).toHaveLength(1)

    const exported = logger.exportLogs()
    expect(JSON.parse(exported)).toHaveLength(1)
    expect(JSON.parse(exported)[0]).toMatchObject({ level: 'warn', context: 'sync' })
  })

  it('exposes logError and logServiceError helpers', () => {
    logError('products', new Error('missing'))
    logServiceError('Get', 'customers', new Error('offline'))

    expect(logger.getLogs()).toMatchObject([
      { context: 'products', message: 'missing' },
      { context: 'Get customers', message: 'offline' },
    ])
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })
})
