import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { TooltipProvider } from './components/ui/tooltip'
import './ide/monaco'

const root = document.getElementById('root')
if (!root) throw new Error('AEKO Studio root element is missing.')

createRoot(root).render(
  <React.StrictMode>
    <TooltipProvider><App /></TooltipProvider>
  </React.StrictMode>,
)
