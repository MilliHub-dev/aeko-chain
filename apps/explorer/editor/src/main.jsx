import React from 'react'
import { createRoot } from 'react-dom/client'
import '@vscode/codicons/dist/codicon.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import App from './App'
import { initializeVscode } from './ide/vscode'

await initializeVscode()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
