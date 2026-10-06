import { esmUrlPlugin } from '@vscode/esbuild-plugin-esm-url'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    dedupe: ['vscode', 'monaco-editor', 'react', 'react-dom'],
  },
  server: { port: 5174, strictPort: true },
  optimizeDeps: {\n    esbuildOptions: { plugins: [esmUrlPlugin()] },\n  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 2500 },
})
