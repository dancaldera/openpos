const platform = window.__OPENPOS_DESKTOP__?.platform ?? 'web'

export function usePlatform() {
  return {
    isMac: platform === 'darwin',
    isWindows: platform === 'win32',
    isLinux: platform === 'linux',
    isDesktop: platform !== 'web',
  }
}
