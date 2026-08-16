import type { APIRoute } from 'astro'
import { errorMessage, json, readJson } from '../../../lib/http'
import { getRequestIp } from '../../../lib/request'
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure } from '../../../lib/registry'
import { createSession, sessionCookieOptions, SESSION_COOKIE, verifyCredentials } from '../../../lib/session'

export const prerender = false

const FAILED_LOGIN_DELAY_MS = 400

export const POST: APIRoute = async ({ request, cookies }) => {
  const ip = getRequestIp(request)

  try {
    const rateLimit = await checkLoginAllowed(ip)
    if (!rateLimit.allowed) {
      return json(
        { error: 'Too many login attempts. Try again later.' },
        429,
        { 'Retry-After': String(rateLimit.retryAfterSeconds ?? 900) },
      )
    }

    const body = await readJson<{ email?: string; password?: string }>(request)
    const email = body.email?.trim() ?? ''
    const password = body.password ?? ''

    if (!email || !password) {
      return json({ error: 'Email and password are required' }, 400)
    }

    if (!verifyCredentials(email, password)) {
      await recordLoginFailure(ip)
      await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS))
      return json({ error: 'Invalid credentials' }, 401)
    }

    await clearLoginFailures(ip)
    const session = await createSession(email)
    cookies.set(SESSION_COOKIE, session, sessionCookieOptions())
    return json({ ok: true })
  } catch (error) {
    return json({ error: errorMessage(error) }, 500)
  }
}
