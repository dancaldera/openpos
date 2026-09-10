import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      all: true,
      include: ['src/**/*.js'],
      exclude: ['**/*.test.js', '**/*.d.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
