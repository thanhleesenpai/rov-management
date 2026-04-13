import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'

// roles: array các role được phép, ví dụ ['admin'] hoặc ['admin', 'operator']
// Nếu không truyền roles thì chỉ cần đăng nhập là vào được
export default function ProtectedRoute({ children, roles }) {
  const { user, refreshToken } = useAuthStore()

  if (!refreshToken) {
    return <Navigate to="/login" replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
