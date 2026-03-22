const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__OPENPOS_DESKTOP__', {
  isElectron: true,
})

contextBridge.exposeInMainWorld('openposDesktop', {
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  greet: (name) => ipcRenderer.invoke('desktop:greet', name),
  hashPassword: (password) => ipcRenderer.invoke('desktop:hash-password', password),
  verifyPassword: (password, hash) => ipcRenderer.invoke('desktop:verify-password', password, hash),
  getDbConnectionConfig: () => ipcRenderer.invoke('desktop:get-db-connection-config'),
  getRuntimeConfig: () => ipcRenderer.invoke('desktop:get-runtime-config'),
  printThermalReceipt: (receiptData) => ipcRenderer.invoke('desktop:print-thermal-receipt', receiptData),
  db: {
    query: (sql, params) => ipcRenderer.invoke('desktop:db-query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('desktop:db-execute', sql, params),
    transaction: (statements) => ipcRenderer.invoke('desktop:db-transaction', statements),
  },
})
