import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'
import { useThemeStore } from './store/theme.store'
import ErrorBoundary from './components/shared/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
})

// Apply dark class to <html> so ALL routes (including auth pages) get dark mode
function ThemeSync() {
  const isDark = useThemeStore((s) => s.isDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])
  return null
}

// Apply saved theme immediately before paint to avoid flash
const savedTheme = JSON.parse(localStorage.getItem('rov-theme') || '{}')
if (savedTheme?.state?.isDark) {
  document.documentElement.classList.add('dark')
}

const root = createRoot(document.getElementById('root'))
window.__hideLoader?.()
root.render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeSync />
        <App />
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
