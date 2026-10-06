import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5174, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 2500 },
})
