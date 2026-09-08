function registerSingleInstance(app, getMainWindow) {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    const window = getMainWindow()
    if (!window || window.isDestroyed()) {
      return
    }

    if (window.isMinimized()) {
      window.restore()
    }
    if (window.isVisible()) {
      window.focus()
    }
  })

  return true
}

module.exports = { registerSingleInstance }
