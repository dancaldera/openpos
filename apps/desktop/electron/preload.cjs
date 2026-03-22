const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__OPENPOS_DESKTOP__', {
  isElectron: true,
})

contextBridge.exposeInMainWorld('openposDesktop', {
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  greet: (name) => ipcRenderer.invoke('desktop:greet', name),
  hashPassword: (password) => ipcRenderer.invoke('desktop:hash-password', password),
  verifyPassword: (password, hash) => ipcRenderer.invoke('desktop:verify-password', password, hash),
  printThermalReceipt: (receiptData) => ipcRenderer.invoke('desktop:print-thermal-receipt', receiptData),
  sync: {
    getStatus: () => ipcRenderer.invoke('desktop:sync-status'),
    trigger: () => ipcRenderer.invoke('desktop:sync-trigger'),
    getConflicts: () => ipcRenderer.invoke('desktop:sync-conflicts'),
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
  db: {
    query: (sql, params) => ipcRenderer.invoke('desktop:db-query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('desktop:db-execute', sql, params),
    transaction: (statements) => ipcRenderer.invoke('desktop:db-transaction', statements),
  },
})
