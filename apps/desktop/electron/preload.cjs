const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__OPENPOS_DESKTOP__', {
  isElectron: true,
})

contextBridge.exposeInMainWorld('openposDesktop', {
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  greet: (name) => ipcRenderer.invoke('desktop:greet', name),
  hashPassword: (password) => ipcRenderer.invoke('desktop:hash-password', password),
  verifyPassword: (password, hash) => ipcRenderer.invoke('desktop:verify-password', password, hash),
  getRuntimeConfig: () => ipcRenderer.invoke('desktop:get-runtime-config'),
  printThermalReceipt: (receiptData) => ipcRenderer.invoke('desktop:print-thermal-receipt', receiptData),
  sync: {
    getStatus: () => ipcRenderer.invoke('desktop:sync-status'),
    trigger: () => ipcRenderer.invoke('desktop:sync-trigger'),
    getConflicts: () => ipcRenderer.invoke('desktop:sync-conflicts'),
  },
  db: {
    query: (sql, params) => ipcRenderer.invoke('desktop:db-query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('desktop:db-execute', sql, params),
    transaction: (statements) => ipcRenderer.invoke('desktop:db-transaction', statements),
  },
})
