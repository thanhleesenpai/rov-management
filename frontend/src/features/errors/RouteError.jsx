import { useRouteError, useNavigate } from 'react-router-dom'
import { AlertTriangle, Home } from 'lucide-react'

export default function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const status = error?.status
  const is404 = status === 404

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-card border border-border rounded-xl shadow-lg p-8 w-full max-w-md text-center">
        <div className="w-14 h-14 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <AlertTriangle size={26} className="text-destructive" />
        </div>
        <h1 className="text-5xl font-bold text-foreground mb-2">{status || '!'}</h1>
        <p className="text-base font-medium text-foreground mb-1">
          {is404 ? 'Page not found' : 'Something went wrong'}
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {error?.statusText || error?.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 mx-auto px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Home size={14} /> Back to Dashboard
        </button>
      </div>
    </div>
  )
}
