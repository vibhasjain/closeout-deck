import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chatPlugin } from './vite-chat'

export default defineConfig({
  plugins: [react(), tailwindcss(), chatPlugin()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // Amplify v5 expects Node's `global`; Vite dev doesn't provide it.
  define: { global: 'globalThis' },
  server: { host: true, port: 9000, strictPort: true },
})
