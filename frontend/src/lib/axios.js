import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' }
})

// Gắn access token vào mỗi request
api.interceptors.request.use(async (config) => {
  let token = useAuthStore.getState().accessToken

  // Nếu chưa có accessToken (vd: sau reload), thử refresh trước
  if (!token) {
    const refreshToken = useAuthStore.getState().refreshToken
    if (refreshToken) {
      try {
        const res = await axios.post('/api/v1/auth/refresh', { refreshToken })
        token = res.data.data.accessToken
        useAuthStore.getState().setAccessToken(token)
        // Refresh user data so persisted avatar URL (which expires) is always up to date
        const meRes = await axios.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        useAuthStore.getState().updateUser(meRes.data.data)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(new Error('Session expired'))
      }
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Tự động refresh token khi hết hạn
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config

    const isAuthEndpoint = original.url?.includes('/auth/')
    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true
      try {
        const refreshToken = useAuthStore.getState().refreshToken
        const res = await axios.post('/api/v1/auth/refresh', { refreshToken })
        const newAccessToken = res.data.data.accessToken
        useAuthStore.getState().setAccessToken(newAccessToken)
        original.headers.Authorization = `Bearer ${newAccessToken}`
        return api(original)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }

    return Promise.reject(error.response?.data || error)
  }
)

export default api
