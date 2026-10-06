import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['vscode', 'monaco-editor', 'react', 'react-dom'],
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  optimizeDeps: {
    // @vscode/diff owns an ESM worker URL and must stay source-served in development.
    // Prebundling it pulls a Node-only filesystem fallback into the browser worker build.
    exclude: ['@vscode/diff'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
})
