import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, Link } from 'react-router-dom'
import { Anchor, Eye, EyeOff } from 'lucide-react'
import api from '@/lib/axios'
import { MarineButton } from '@/components/bespoke/MarineButton'
import { MarineInput } from '@/components/bespoke/MarineInput'
import { startGoogleOAuth } from '@/lib/oauthNonce'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'
const GOOGLE_AUTH_URL = `${API_BASE}/auth/google`

function GoogleButton() {
  const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
  return (
    <MarineButton
      variant="outline"
      type="button"
      icon={GoogleIcon}
      onClick={() => startGoogleOAuth(GOOGLE_AUTH_URL)}
      className="w-full"
    >
      Continue with Google
    </MarineButton>
  )
}

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors }, watch } = useForm()
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const navigate = useNavigate()

  const onSubmit = async (data) => {
    setLoading(true)
    setServerError('')
    try {
      await api.post('/auth/register', {
        email: data.email,
        password: data.password,
        fullName: data.fullName
      })
      navigate('/login')
    } catch (err) {
      setServerError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl shadow-xl p-8 w-full max-w-md border border-border">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <Anchor className="text-primary" size={24} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Create Account</h1>
          <p className="text-muted-foreground text-sm mt-1">Join the ROV Management System</p>
        </div>

        <GoogleButton />

        <div className="flex items-center gap-3 my-5">
          <hr className="flex-1 border-border" />
          <span className="text-xs text-muted-foreground">or register with email</span>
          <hr className="flex-1 border-border" />
        </div>

        {serverError && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
            <MarineInput
              {...register('fullName', { required: 'Full name is required' })}
              placeholder="Nguyen Van A"
            />
            {errors.fullName && <p className="text-destructive text-xs mt-1">{errors.fullName.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <MarineInput
              {...register('email', { required: 'Email is required' })}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Password</label>
            <div className="relative">
              <MarineInput
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 6, message: 'At least 6 characters' }
                })}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                className="pr-10"
              />
              <MarineButton
                variant="icon"
                type="button"
                onClick={() => setShowPassword(v => !v)}
                icon={showPassword ? EyeOff : Eye}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              />
            </div>
            {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Confirm Password</label>
            <div className="relative">
              <MarineInput
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => value === watch('password') || 'Passwords do not match'
                })}
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                className="pr-10"
              />
              <MarineButton
                variant="icon"
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                icon={showConfirm ? EyeOff : Eye}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              />
            </div>
            {errors.confirmPassword && <p className="text-destructive text-xs mt-1">{errors.confirmPassword.message}</p>}
          </div>

          <MarineButton
            variant="solid"
            type="submit"
            disabled={loading}
            className="w-full mt-2"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </MarineButton>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
