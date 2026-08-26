import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

// https://vite.dev/config/
export default defineConfig({
  base: "/payroll/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../payroll",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
