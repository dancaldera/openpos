import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

// Web build config — builds the frontend for browser deployment
// Key differences from vite.config.ts:
//   - VITE_PLATFORM=web env var for tree-shaking
//   - No Tauri dev server (uses Vite's default)
//   - Aliases @tauri-apps/* to stub modules
//   - Outputs to dist-web/ instead of dist/
//   - No Tauri-specific plugins or configs
export default defineConfig(async () => ({
  plugins: [preact(), tailwindcss()],

  // Aliases for Tauri packages that don't exist in browser
  resolve: {
    alias: {
      '@tauri-apps/api/core': '/src/stubs/tauri-core.ts',
      '@tauri-apps/api': '/src/stubs/tauri-api.ts',
      '@tauri-apps/plugin-sql': '/src/stubs/tauri-plugin-sql.ts',
      '@tauri-apps/plugin-opener': '/src/stubs/tauri-plugin-opener.ts',
      '@tauri-apps/plugin-updater': '/src/stubs/tauri-plugin-updater.ts',
      '@tauri-apps/plugin-process': '/src/stubs/tauri-plugin-process.ts',
    },
  },

  // Build-time env vars
  define: {
    VITE_PLATFORM: JSON.stringify('web'),
  },

  // Dev server proxy — routes /api/* to the Hono backend on port 3001
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  // Output to dist-web/ to avoid colliding with desktop build
  build: {
    outDir: 'dist-web',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separate vendor dependencies for better caching
          if (id.includes('node_modules/preact') || id.includes('node_modules/@preact/signals')) {
            return 'vendor'
          }
          // Separate UI library
          if (id.includes('node_modules/sonner')) {
            return 'ui'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    assetsInlineLimit: 4096,
  },
}));
