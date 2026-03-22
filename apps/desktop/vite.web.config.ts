import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(async () => ({
  plugins: [preact(), tailwindcss()],
  define: {
    VITE_PLATFORM: JSON.stringify('web'),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist-web',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/preact') || id.includes('node_modules/@preact/signals')) {
            return 'vendor'
          }
          if (id.includes('node_modules/sonner')) {
            return 'ui'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    assetsInlineLimit: 4096,
  },
}))
