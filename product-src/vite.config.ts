import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chatPlugin } from './vite-chat'

export default defineConfig({
  base: '/product/',
  plugins: [react(), tailwindcss(), chatPlugin()],
  build: { outDir: '../product', emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: true, port: 9000, strictPort: true },
})
