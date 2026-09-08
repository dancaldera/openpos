import { signal } from '@preact/signals'

const STORAGE_KEY = 'sidebar_collapsed'

export const sidebarCollapsed = signal(typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1')

export function setSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  sidebarCollapsed.value = collapsed
}
