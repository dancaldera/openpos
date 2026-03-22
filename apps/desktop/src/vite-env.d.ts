/// <reference types="vite/client" />

interface Window {
  __OPENPOS_DESKTOP__?: { isElectron?: boolean }
  openposDesktop?: import('./lib/desktop').DesktopApi
}
