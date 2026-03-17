const API_URL = import.meta.env.VITE_API_URL || ''

export function getApiUrl(path: string): string {
  if (API_URL) {
    return `${API_URL}${path}`
  }
  return path
}
