import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.js'],
    coverage: {
      // istanbul: electron/*.cjs loads both natively and through the
      // transform pipeline under one URL, which corrupts V8 range
      // attribution (verified: sane single-file, garbage merged);
      // istanbul's in-code counters merge truthfully (see @openpos/sync).
      provider: 'istanbul',
      reporter: ['text'],
      all: true,
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.cjs'],
      exclude: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.js', 'src/**/*.d.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
