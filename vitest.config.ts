import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/global.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@backend': path.resolve(__dirname, 'app/backend/src'),
      '@shared': path.resolve(__dirname, 'app/shared'),
    },
  },
})
