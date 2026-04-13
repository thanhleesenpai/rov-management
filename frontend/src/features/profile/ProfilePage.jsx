import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { User, KeyRound, Settings, Save, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'

const TABS = [
  { id: 'profile',  label: 'My Profile',     icon: User },
  { id: 'password', label: 'Change Password', icon: KeyRound },
  { id: 'settings', label: 'Settings',        icon: Settings }
]

const ROLE_STYLE = {
  admin:    'bg-purple-100 text-purple-700',
  operator: 'bg-blue-100 text-blue-700',
  viewer:   'bg-gray-100 text-gray-600'
}

function ProfileTab({ user, updateUser }) {
  const [form, setForm] = useState({ fullName: user?.fullName || '' })

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xl font-bold">
            {user?.fullName?.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase()}
          </span>
        </div>
        <div>
          <p className="font-semibold text-gray-800">{user?.fullName}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <span className={`text-xs px-2 py-0.5 rounded font-medium mt-1 inline-block ${ROLE_STYLE[user?.role]}`}>
            {user?.role}
          </span>
        </div>
      </div>

      {/* Form */}
      <div className="border-t pt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={form.fullName}
            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 max-w-md cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <input
            type="text"
            value={user?.role || ''}
            disabled
            className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 max-w-md cursor-not-allowed capitalize"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Member Since</label>
          <input
            type="text"
            value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
            disabled
            className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 max-w-md cursor-not-allowed"
          />
        </div>
      </div>

      <button
        onClick={() => updateUser({ fullName: form.fullName })}
        disabled={form.fullName === user?.fullName || !form.fullName}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Save size={15} /> Save Changes
      </button>
    </div>
  )
}

const inputCls = 'w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-md'

function PasswordField({ label, field, show, onToggle, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative max-w-md">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className={inputCls}
          required
        />
        <button type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  )
}

function PasswordTab() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [show, setShow] = useState({ current: false, new: false, confirm: false })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => api.patch('/auth/change-password', data),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setError('')
    },
    onError: (err) => setError(err.message || 'Failed to change password')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (form.newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }
    mutation.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>}
      <PasswordField
        label="Current Password" value={form.currentPassword}
        onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
        show={show.current} onToggle={() => setShow(s => ({ ...s, current: !s.current }))}
      />
      <PasswordField
        label="New Password" value={form.newPassword}
        onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
        show={show.new} onToggle={() => setShow(s => ({ ...s, new: !s.new }))}
      />
      <PasswordField
        label="Confirm New Password" value={form.confirmPassword}
        onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
        show={show.confirm} onToggle={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        <Save size={15} />
        {mutation.isPending ? 'Saving...' : 'Update Password'}
      </button>
    </form>
  )
}

function SettingsTab() {
  return (
    <div className="space-y-6 max-w-md">
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-700 mb-1">Language</p>
        <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </select>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Email Notifications</p>
          <p className="text-xs text-gray-400 mt-0.5">Receive updates about trips and jobs</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" defaultChecked />
          <div className="w-10 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>
      <p className="text-xs text-gray-400">More settings coming soon.</p>
    </div>
  )
}

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, updateUser } = useAuthStore()

  const activeTab = searchParams.get('tab') || 'profile'

  const updateMutation = useMutation({
    mutationFn: (data) => api.patch('/auth/me', data),
    onSuccess: (res) => {
      updateUser(res.data)
      toast.success('Profile updated')
    },
    onError: (err) => toast.error(err.message || 'Failed to update profile')
  })

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Account</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSearchParams(id === 'profile' ? {} : { tab: id })}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {activeTab === 'profile' && (
          <ProfileTab user={user} updateUser={(data) => updateMutation.mutate(data)} />
        )}
        {activeTab === 'password' && <PasswordTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
