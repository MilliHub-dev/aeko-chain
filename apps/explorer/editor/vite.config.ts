import { esmUrlPlugin } from '@vscode/rollup-plugin-esm-url'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

// The package is built for Vite, but its Rollup hook types differ from Vite 7's
// local hook types. Keep that compatibility cast at this one configuration seam.
const esmUrlVitePlugin = esmUrlPlugin() as unknown as PluginOption

export default defineConfig({
  plugins: [esmUrlVitePlugin, react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    dedupe: ['vscode', 'monaco-editor', 'react', 'react-dom'],
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: { ignored: ['**/.aeko-workspaces/**'] },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 2500 },
})
