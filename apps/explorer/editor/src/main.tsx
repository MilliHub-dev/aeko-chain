import React from 'react'
import { createRoot } from 'react-dom/client'
import '@vscode/codicons/dist/codicon.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import App from './App'
import { initializeVscode } from './ide/vscode'

await initializeVscode()

const root = document.getElementById('root')
if (!root) throw new Error('Contract Studio root element is missing.')

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
