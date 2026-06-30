import { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { User, KeyRound, Settings, Save, Eye, EyeOff, Camera } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineButton } from '@/components/bespoke/MarineButton'
import { MarineInput } from '@/components/bespoke/MarineInput'
import { useAuthStore } from '@/store/auth.store'

const TABS = [
  { id: 'profile',  label: 'My Profile',     icon: User },
  { id: 'password', label: 'Change Password', icon: KeyRound },
  { id: 'settings', label: 'Settings',        icon: Settings }
]

const ROLE_STYLE = {
  admin:    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  operator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  viewer:   'bg-muted text-muted-foreground'
}

function AvatarUpload({ user, onUploaded }) {
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Only image files allowed'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('File too large (max 5MB)'); return }

    setUploading(true)
    try {
      const { data } = await api.post('/auth/me/avatar/presigned', {
        fileName: file.name,
        mimeType: file.type
      })
      const { uploadUrl, s3Key } = data

      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      // Save s3Key to DB; response includes a fresh presigned URL generated server-side
      const patchRes = await api.patch('/auth/me', { avatar: s3Key })
      onUploaded(patchRes.data.avatar)
      toast.success('Avatar updated')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const initials = user?.fullName?.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase()

  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={uploading}
      className="relative w-16 h-16 rounded-full shrink-0 group"
    >
      {user?.avatar
        ? <img src={user.avatar} alt="avatar" className="w-16 h-16 rounded-full object-cover" />
        : <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xl font-bold">{initials}</span>
          </div>
      }
      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        {uploading
          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Camera size={16} className="text-white" />
        }
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </button>
  )
}

function ProfileTab({ user, updateUser, isPending }) {
  const [form, setForm] = useState({ fullName: user?.fullName || '' })
  const { updateUser: updateStore } = useAuthStore()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <AvatarUpload user={user} onUploaded={(url) => updateStore({ avatar: url })} />
        <div>
          <p className="font-semibold text-foreground">{user?.fullName}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <span className={`text-xs px-2 py-0.5 rounded font-medium mt-1 inline-block ${ROLE_STYLE[user?.role]}`}>
            {user?.role}
          </span>
          <p className="text-xs text-muted-foreground mt-1">Click avatar to change photo</p>
        </div>
      </div>

      <div className="border-t border-border pt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
          <MarineInput
            type="text"
            value={form.fullName}
            onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
            className="max-w-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Email</label>
          <MarineInput
            type="email"
            value={user?.email || ''}
            disabled
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Role</label>
          <MarineInput
            type="text"
            value={user?.role || ''}
            disabled
            className="max-w-md capitalize"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Member Since</label>
          <MarineInput
            type="text"
            value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
            disabled
            className="max-w-md"
          />
        </div>
      </div>

      <MarineButton
        variant="solid"
        icon={Save}
        onClick={() => updateUser({ fullName: form.fullName })}
        disabled={isPending || form.fullName === user?.fullName || !form.fullName}
      >
        {isPending ? 'Saving...' : 'Save Changes'}
      </MarineButton>
    </div>
  )
}

const inputCls = 'w-full border border-input bg-background text-foreground rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-w-md'

function PasswordField({ label, show, onToggle, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <div className="relative max-w-md">
        <MarineInput
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className="pr-10"
          required
        />
        <MarineButton
          variant="icon"
          type="button"
          icon={show ? EyeOff : Eye}
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        />
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
    if (form.newPassword !== form.confirmPassword) { setError('New passwords do not match'); return }
    if (form.newPassword.length < 6) { setError('New password must be at least 6 characters'); return }
    mutation.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}
      <PasswordField label="Current Password" value={form.currentPassword}
        onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
        show={show.current} onToggle={() => setShow(s => ({ ...s, current: !s.current }))} />
      <PasswordField label="New Password" value={form.newPassword}
        onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
        show={show.new} onToggle={() => setShow(s => ({ ...s, new: !s.new }))} />
      <PasswordField label="Confirm New Password" value={form.confirmPassword}
        onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
        show={show.confirm} onToggle={() => setShow(s => ({ ...s, confirm: !s.confirm }))} />
      <MarineButton
        variant="solid"
        icon={Save}
        type="submit"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Saving...' : 'Update Password'}
      </MarineButton>
    </form>
  )
}



function SettingsTab() {
  const [lang, setLang] = useState('en')
  return (
    <div className="space-y-6 max-w-md">
      <div className="bg-muted rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-1">Language</p>
        <MarineSelect value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </MarineSelect>
      </div>
      <div className="bg-muted rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Email Notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">Receive updates about projects and jobs</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" defaultChecked />
          <div className="w-10 h-6 bg-muted-foreground/30 peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">More settings coming soon.</p>
    </div>
  )
}

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, updateUser } = useAuthStore()

  const activeTab = searchParams.get('tab') || 'profile'
  const isGoogleUser = user?.authProvider === 'google'
  const visibleTabs = TABS.filter(t => !(t.id === 'password' && isGoogleUser))

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
      <h1 className="text-2xl font-bold text-foreground mb-6">Account</h1>

      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6 w-fit">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSearchParams(id === 'profile' ? {} : { tab: id })}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        {activeTab === 'profile' && (
          <ProfileTab user={user} updateUser={(data) => updateMutation.mutate(data)} isPending={updateMutation.isPending} />
        )}
        {activeTab === 'password' && <PasswordTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
