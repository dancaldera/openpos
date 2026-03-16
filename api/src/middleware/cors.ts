/**
 * CORS middleware for the OpenPOS API.
 *
 * Allows requests from:
 *   - The Vercel deployment (set via ALLOWED_ORIGIN env var)
 *   - localhost:5173 and localhost:4173 for local web development
 *
 * The Tauri desktop app does not need CORS headers because it uses
 * the Turso client directly (no HTTP proxy).
 */

import type { MiddlewareHandler } from 'hono'

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:1420']

function getAllowedOrigins(): string[] {
  const configuredOrigin = process.env.ALLOWED_ORIGIN
  return configuredOrigin ? [configuredOrigin, ...DEV_ORIGINS] : DEV_ORIGINS
}

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('Origin') ?? ''
  const allowedOrigins = getAllowedOrigins()

  const isAllowed = allowedOrigins.some((o) => origin === o) || origin === ''

  if (isAllowed) {
    c.header('Access-Control-Allow-Origin', origin || '*')
  }

  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  c.header('Access-Control-Allow-Credentials', 'true')
  c.header('Access-Control-Max-Age', '86400')

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  await next()
}
