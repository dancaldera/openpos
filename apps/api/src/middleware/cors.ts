/**
 * CORS middleware for the OpenPOS API.
 *
 * Allows requests from:
 *   - Deployed web clients (ALLOWED_ORIGIN, comma-separated)
 *   - localhost:5173, localhost:4173, and localhost:1420 for local web development
 *
 * Electron development also uses the localhost origins when calling the API.
 */

import type { MiddlewareHandler } from 'hono'

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:1420']

function getAllowedOrigins(): string[] {
  const configuredOrigin = process.env.ALLOWED_ORIGIN
  const extra = configuredOrigin
    ? configuredOrigin
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : []
  return [...extra, ...DEV_ORIGINS]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-OpenPOS-Connection',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
}

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('Origin') ?? ''
  const allowedOrigins = getAllowedOrigins()
  const isAllowed = allowedOrigins.some((o) => origin === o) || origin === ''
  const allowOrigin = isAllowed ? origin || '*' : null

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Origin': allowOrigin || '',
      },
    })
  }

  if (allowOrigin) {
    c.header('Access-Control-Allow-Origin', allowOrigin)
  }
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    c.header(key, value)
  }

  await next()
}
