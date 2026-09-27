import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { NetworkProvider } from './components/NetworkContext.jsx'
import AppErrorBoundary from './observability/AppErrorBoundary.jsx'
import { installGlobalErrorLogging } from './observability/logger.js'
import './index.css'

installGlobalErrorLogging()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <NetworkProvider>
          <App />
        </NetworkProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
