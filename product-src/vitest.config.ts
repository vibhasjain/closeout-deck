import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // Full-roster weeks (about 6,000 time entries) take a few seconds to render server-side.
  test: { environment: 'node', include: ['src/**/*.test.ts', 'test/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 },
})
