import type { DesktopFirstRunStatus } from '../lib/desktop'

export type ConnectionSetupMode = 'choose' | 'import' | 'kit' | 'api'

export function connectionSetupMode(status: DesktopFirstRunStatus | null): ConnectionSetupMode {
  if (status?.status === 'needsEmergencyKit') return 'kit'
  if (status?.status === 'needsApi') return 'api'
  if (status?.status === 'needsOwner') return 'import'
  return 'choose'
}
