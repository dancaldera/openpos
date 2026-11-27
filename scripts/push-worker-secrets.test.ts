import { describe, expect, it } from 'vitest'
import { parseArgs, planPush, WORKER_SECRETS } from './push-worker-secrets'

describe('push-worker-secrets', () => {
  it('targets every Worker by default and parses filters', () => {
    expect(parseArgs([])).toEqual({ workers: ['api', 'admin'], only: null, dryRun: false })
    expect(parseArgs(['--worker', 'admin', '--only', 'A, B', '--dry-run'])).toEqual({
      workers: ['admin'],
      only: ['A', 'B'],
      dryRun: true,
    })
    expect(() => parseArgs(['--worker', 'web'])).toThrow('--worker must be one of')
    expect(() => parseArgs(['--only', ''])).toThrow('--only needs')
    expect(() => parseArgs(['--force'])).toThrow('Unknown argument')
  })

  it('pushes only keys present in the environment and reports the rest', () => {
    const env = { CONTROL_PLANE_URL: 'libsql://cp', ADMIN_SESSION_SECRET: 's', JWT_SECRET: '  ' }
    const [api, admin] = planPush(parseArgs([]), env)
    expect(api).toEqual({
      worker: 'api',
      push: ['CONTROL_PLANE_URL'],
      missing: WORKER_SECRETS.api.filter((key) => key !== 'CONTROL_PLANE_URL'),
    })
    expect(admin?.push).toEqual(['ADMIN_SESSION_SECRET', 'CONTROL_PLANE_URL'])
  })

  it('limits the plan with --only and rejects names no selected Worker reads', () => {
    const env = { CONTROL_PLANE_URL: 'libsql://cp', TURSO_API_TOKEN: 't' }
    expect(planPush(parseArgs(['--only', 'CONTROL_PLANE_URL']), env).map((plan) => plan.push)).toEqual([
      ['CONTROL_PLANE_URL'],
      ['CONTROL_PLANE_URL'],
    ])
    expect(() => planPush(parseArgs(['--worker', 'api', '--only', 'TURSO_API_TOKEN']), env)).toThrow(
      'Not a secret of the selected Workers: TURSO_API_TOKEN',
    )
  })
})
