import { describe, expect, it } from 'vitest'
import { connectionSetupMode } from './connection-setup-mode'

describe('connectionSetupMode', () => {
  it('opens the API step after the store is connected', () => {
    expect(
      connectionSetupMode({
        status: 'needsApi',
        remoteConfigured: true,
        activeUserCount: 1,
        storeName: 'Store',
        apiUrl: '',
      }),
    ).toBe('api')
  })

  it('keeps the emergency kit ahead of the chooser and routes empty databases to the unified form', () => {
    expect(
      connectionSetupMode({
        status: 'needsEmergencyKit',
        remoteConfigured: true,
        activeUserCount: 0,
        storeName: 'Store',
      }),
    ).toBe('kit')
    expect(
      connectionSetupMode({
        status: 'needsOwner',
        remoteConfigured: true,
        activeUserCount: 0,
        storeName: 'Store',
      }),
    ).toBe('import')
    expect(
      connectionSetupMode({
        status: 'needsConnection',
        remoteConfigured: false,
        activeUserCount: 0,
      }),
    ).toBe('choose')
  })
})
