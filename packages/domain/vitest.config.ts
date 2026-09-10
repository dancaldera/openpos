import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.test.js'],
    // Single-process run: one process keeps per-line attribution truthful
    // for CJS loaded through the transform pipeline.
    isolate: false,
    coverage: {
      // istanbul: V8 reports phantom gaps on this CJS source (verified
      // against passing assertions); istanbul attributes truthfully here.
      provider: 'istanbul',
      reporter: ['text'],
      all: true,
      include: ['src/**/*.js'],
      exclude: ['**/*.test.js', '**/*.d.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
