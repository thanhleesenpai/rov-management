import { useNavigate } from 'react-router-dom'
import { Anchor } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
        <Anchor size={28} className="text-blue-600" />
      </div>
      <h1 className="text-6xl font-bold text-gray-800 mb-2">404</h1>
      <p className="text-gray-500 mb-8">This page doesn't exist or you don't have access.</p>
      <button
        onClick={() => navigate('/dashboard')}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        Back to Dashboard
      </button>
    </div>
  )
}
