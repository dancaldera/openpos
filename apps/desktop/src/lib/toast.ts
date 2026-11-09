import type { ShowToastFn } from '@astryxdesign/core/Toast'

/**
 * App-wide notifications. Stores and services call `toast.success(...)` from
 * outside React; `ToastBridge` (mounted once under the Astryx theme) hands this
 * module the Astryx `useToast` function. Messages sent before it mounts queue
 * up and flush on registration.
 */
export type ToastKind = 'success' | 'error' | 'warning' | 'info'

interface PendingToast {
  kind: ToastKind
  message: string
}

let show: ShowToastFn | null = null
let pending: PendingToast[] = []

function emit(kind: ToastKind, message: string): void {
  if (!show) {
    pending.push({ kind, message })
    return
  }
  // Astryx toasts are `info` (auto-hide) or `error` (persist until dismissed).
  // Warnings carry information the user should read, so they persist too.
  show({
    body: message,
    type: kind === 'error' || kind === 'warning' ? 'error' : 'info',
    uniqueID: `${kind}:${message}`,
  })
}

export function registerToastHandler(handler: ShowToastFn | null): void {
  show = handler
  if (!handler || pending.length === 0) return
  const queued = pending
  pending = []
  for (const item of queued) emit(item.kind, item.message)
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  warning: (message: string) => emit('warning', message),
  info: (message: string) => emit('info', message),
}
