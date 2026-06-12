import type { APIRoute } from 'astro'
import { json } from '../../../lib/http'
import { SESSION_COOKIE } from '../../../lib/session'

export const prerender = false

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' })
  return json({ ok: true })
}
