import type { APIRoute } from 'astro'
import { errorMessage, json, readJson } from '../../../lib/http'
import { createSession, sessionCookieOptions, SESSION_COOKIE, verifyCredentials } from '../../../lib/session'

export const prerender = false

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await readJson<{ email?: string; password?: string }>(request)
    const email = body.email?.trim() ?? ''
    const password = body.password ?? ''

    if (!email || !password) {
      return json({ error: 'Email and password are required' }, 400)
    }

    if (!verifyCredentials(email, password)) {
      return json({ error: 'Invalid credentials' }, 401)
    }

    const session = await createSession(email)
    cookies.set(SESSION_COOKIE, session, sessionCookieOptions())
    return json({ ok: true })
  } catch (error) {
    return json({ error: errorMessage(error) }, 500)
  }
}
