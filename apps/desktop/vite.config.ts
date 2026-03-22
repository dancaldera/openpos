import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(async () => ({
  plugins: [preact(), tailwindcss()],
  clearScreen: false,
  base: './',
  define: {
    VITE_PLATFORM: JSON.stringify('desktop'),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/dist-electron/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
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
