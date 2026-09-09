import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      all: true,
      include: ['scripts/**/*.ts'],
      exclude: ['scripts/**/*.test.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
