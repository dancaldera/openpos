import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const isWeb = mode === 'web'

  return {
    plugins: [
      react({
        // Components that read signals (`signal.value`) re-render when they change.
        babel: { plugins: [['module:@preact/signals-react-transform', { mode: 'all' }]] },
      }),
      tailwindcss(),
    ],
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
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/') ||
              id.includes('node_modules/@preact/signals')
            ) {
              return 'vendor'
            }
            if (id.includes('node_modules/@astryxdesign') || id.includes('node_modules/@stylexjs')) {
              return 'astryx'
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
