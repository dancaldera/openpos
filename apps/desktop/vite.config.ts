import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const isWeb = mode === 'web'

  return {
    plugins: [preact(), tailwindcss()],
    clearScreen: isWeb ? undefined : false,
    base: isWeb ? undefined : './',
    define: {
      VITE_PLATFORM: JSON.stringify(isWeb ? 'web' : 'desktop'),
    },
    server: isWeb
      ? {
          port: 5173,
          strictPort: true,
          proxy: {
            '/api': {
              target: process.env.VITE_DEV_API_PROXY || 'http://localhost:3001',
              changeOrigin: true,
              // The API picks the store from the browser host (demo.localhost), like the web Worker in production.
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyReq, req) => {
                  if (req.headers.host) proxyReq.setHeader('X-Forwarded-Host', req.headers.host)
                })
              },
            },
          },
        }
      : {
          port: 1420,
          strictPort: true,
          watch: {
            ignored: ['**/dist-electron/**'],
          },
        },
    build: {
      outDir: isWeb ? 'dist-web' : undefined,
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
  }
})
