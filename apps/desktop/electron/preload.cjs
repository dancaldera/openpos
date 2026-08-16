const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__OPENPOS_DESKTOP__', {
  isElectron: true,
  platform: process.platform,
})

contextBridge.exposeInMainWorld('openposDesktop', {
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  greet: (name) => ipcRenderer.invoke('desktop:greet', name),
  hashPassword: (password) => ipcRenderer.invoke('desktop:hash-password', password),
  verifyPassword: (password, hash) => ipcRenderer.invoke('desktop:verify-password', password, hash),
  printThermalReceipt: (receiptData) => ipcRenderer.invoke('desktop:print-thermal-receipt', receiptData),
  getConfig: () => ipcRenderer.invoke('desktop:config'),
  sync: {
    getStatus: () => ipcRenderer.invoke('desktop:sync-status'),
    trigger: () => ipcRenderer.invoke('desktop:sync-trigger'),
    getConflicts: () => ipcRenderer.invoke('desktop:sync-conflicts'),
    resetLocal: () => ipcRenderer.invoke('desktop:sync-reset-local'),
  },
  connectivity: {
    getStatus: () => ipcRenderer.invoke('desktop:connectivity-status'),
    refresh: () => ipcRenderer.invoke('desktop:connectivity-refresh'),
  },
  startup: {
    getStatus: () => ipcRenderer.invoke('desktop:startup-status'),
    initialize: () => ipcRenderer.invoke('desktop:startup-initialize'),
    retry: () => ipcRenderer.invoke('desktop:startup-retry'),
  },
  orders: {
    syncAggregate: (orderId, operation) =>
      ipcRenderer.invoke('desktop:orders-sync-aggregate', {
        orderId,
        operation,
      }),
  },
  db: {
    query: (sql, params) => ipcRenderer.invoke('desktop:db-query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('desktop:db-execute', sql, params),
    transaction: (statements) => ipcRenderer.invoke('desktop:db-transaction', statements),
  },
  images: {
    save: (payload) => ipcRenderer.invoke('desktop:image-save', payload),
    resolve: (keys) => ipcRenderer.invoke('desktop:image-resolve', keys),
    delete: (key) => ipcRenderer.invoke('desktop:image-delete', key),
  },
  theme: {
    get: () => ipcRenderer.invoke('desktop:theme'),
    onChange: (cb) => {
      const wrapped = (_event, theme) => cb(theme)
      ipcRenderer.on('desktop:theme-changed', wrapped)
      return () => { ipcRenderer.removeListener('desktop:theme-changed', wrapped) }
    },
  },
  navigation: {
    onNavigate: (cb) => {
      const wrapped = (_event, page) => cb(page)
      ipcRenderer.on('navigate', wrapped)
      return () => { ipcRenderer.removeListener('navigate', wrapped) }
    },
  },
  updates: {
    openReleasePage: (url) => ipcRenderer.invoke('desktop:open-external', url),
    relaunch: () => ipcRenderer.invoke('desktop:relaunch'),
    downloadAppImageUpdate: (url, version) => ipcRenderer.invoke('desktop:update-download-appimage', { url, version }),
    downloadDebUpdate: (url, version) => ipcRenderer.invoke('desktop:update-download-deb', { url, version }),
    installDownloadedAppImage: (tempPath) => ipcRenderer.invoke('desktop:update-install-appimage', { tempPath }),
    installDownloadedDeb: (tempPath) => ipcRenderer.invoke('desktop:update-install-deb', { tempPath }),
    restartFromInstalledAppImage: () => ipcRenderer.invoke('desktop:update-restart-appimage'),
    downloadMacZipUpdate: (url, version) => ipcRenderer.invoke('desktop:update-download-mac-zip', { url, version }),
    installDownloadedMacZip: (tempPath) => ipcRenderer.invoke('desktop:update-install-mac-zip', { tempPath }),
    restartFromUpdatedMacApp: () => ipcRenderer.invoke('desktop:update-restart-mac'),
    onStatusChange: (listener) => {
      const wrapped = (_event, payload) => listener(payload)
      ipcRenderer.on('desktop:update-status', wrapped)
      return () => {
        ipcRenderer.removeListener('desktop:update-status', wrapped)
      }
    },
  },
})
