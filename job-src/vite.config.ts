import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: '/job/',
  build: { outDir: '../job', emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // ../shared/session.js (one sign-in across /product, /answers, /job) lives outside this root.
  server: { fs: { allow: ['..'] } },
})
