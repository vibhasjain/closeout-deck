import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/product/',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../product', emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 9000, strictPort: true, proxy: { '/api': { target: 'http://localhost:8787', rewrite: (url) => url.replace(/^\/api/, '') } } },
})
