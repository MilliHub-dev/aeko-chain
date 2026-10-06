import { esmUrlPlugin } from '@vscode/esbuild-plugin-esm-url'
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
    esbuildOptions: {
      plugins: [esmUrlPlugin()],
    },
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
