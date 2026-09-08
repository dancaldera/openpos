/// <reference types="vite/client" />

type DesktopPlatform = 'darwin' | 'win32' | 'linux' | 'web'

interface Window {
  __OPENPOS_DESKTOP__?: { isElectron?: boolean; platform?: DesktopPlatform }
  openposDesktop?: import('./lib/desktop').DesktopApi
}
