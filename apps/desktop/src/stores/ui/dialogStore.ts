import { signal } from '@preact/signals'

export const openFullSizeDialogCount = signal(0)

export function registerFullSizeDialog() {
  openFullSizeDialogCount.value += 1

  return () => {
    openFullSizeDialogCount.value = Math.max(0, openFullSizeDialogCount.value - 1)
  }
}
