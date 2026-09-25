import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SecurityProvider } from './app/SecurityContext'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { ToastProvider } from './ui/Toast'
import './app/app.css'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SecurityProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </SecurityProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
