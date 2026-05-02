import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Anchor } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/axios'

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  useEffect(() => {
    const accessToken  = searchParams.get('accessToken')
    const refreshToken = searchParams.get('refreshToken')
    const error        = searchParams.get('error')

    if (error || !accessToken || !refreshToken) {
      navigate('/login?error=oauth_failed')
      return
    }

    // Lưu token tạm để fetch /auth/me
    useAuthStore.setState({ accessToken, refreshToken })

    api.get('/auth/me')
      .then(res => {
        setAuth(res.data, accessToken, refreshToken)
        navigate('/dashboard', { replace: true })
      })
      .catch(() => navigate('/login?error=oauth_failed'))
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
        <Anchor className="text-blue-600" size={24} />
      </div>
      <p className="text-white text-sm">Signing you in...</p>
      <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
