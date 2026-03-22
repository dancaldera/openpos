let cachedApiUrl: string | null = null

export async function getApiUrl(path: string): Promise<string> {
  if (cachedApiUrl === null) {
    // Check if running in Electron with desktop API available
    if (typeof window !== 'undefined' && window.openposDesktop?.getConfig) {
      const config = await window.openposDesktop.getConfig()
      cachedApiUrl = config.apiUrl || ''
    } else {
      // Fallback to build-time env var (development or web builds)
      cachedApiUrl = import.meta.env.VITE_API_URL || ''
    }
  }
  if (cachedApiUrl) {
    return `${cachedApiUrl}${path}`
  }
  return path
}
