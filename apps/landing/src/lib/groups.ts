import type { TursoGroup } from './turso-platform'

export const PREFERRED_GROUP = 'openpos'

export function pickDefaultGroup(groups: TursoGroup[]): string {
  if (groups.some((group) => group.name === PREFERRED_GROUP)) {
    return PREFERRED_GROUP
  }
  return groups[0]?.name ?? 'default'
}

export function resolveGroupFilter(
  groups: TursoGroup[],
  requested: string | null | undefined,
): string {
  if (requested === 'all') return ''
  if (requested) return requested
  return groups.some((group) => group.name === PREFERRED_GROUP) ? PREFERRED_GROUP : ''
}
