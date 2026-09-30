import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { NetworkProvider } from './components/NetworkContext.jsx'
import AppErrorBoundary from './observability/AppErrorBoundary.jsx'
import { installGlobalErrorLogging } from './observability/logger.js'
import { queryClient } from './queryClient.js'
import './index.css'

installGlobalErrorLogging()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <NetworkProvider>
            <App />
          </NetworkProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
