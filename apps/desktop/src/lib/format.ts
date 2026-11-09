export function formatMoney(amount: number, currencySymbol: string): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}${currencySymbol}${Math.abs(amount).toFixed(2)}`
}

export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatTime(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(value: string | number | Date): string {
  return `${formatDate(value)}, ${formatTime(value)}`
}

/** Short, human-friendly reference for long ids (last 8 characters, upper-cased). */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(-8).toUpperCase() : id.toUpperCase()
}
