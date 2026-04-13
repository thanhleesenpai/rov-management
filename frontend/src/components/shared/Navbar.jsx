import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, PanelLeftClose, PanelLeftOpen, Bell, User, Settings, KeyRound, LogOut, ChevronDown, Waves } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/axios'

const ROLE_STYLE = {
  admin:    'bg-purple-100 text-purple-700',
  operator: 'bg-blue-100 text-blue-700',
  viewer:   'bg-gray-100 text-gray-600'
}

export default function Navbar({ collapsed, onToggleCollapse, onOpenMobile }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch {}
    logout()
    navigate('/login')
  }

  const menuItems = [
    { icon: User,     label: 'My Profile',      action: () => navigate('/profile') },
    { icon: KeyRound, label: 'Change Password',  action: () => navigate('/profile?tab=password') },
    { icon: Settings, label: 'Settings',         action: () => navigate('/profile?tab=settings') },
  ]

  const initials = user?.fullName
    ?.split(' ')
    .map(w => w[0])
    .slice(-2)
    .join('')
    .toUpperCase() || '?'

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 z-10">
      {/* Left: toggle + logo */}
      <div className="flex items-center gap-2">
        {/* Desktop collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        {/* Mobile menu button */}
        <button
          onClick={onOpenMobile}
          className="flex lg:hidden items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu size={18} />
        </button>

        {/* Logo */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 ml-1 rounded-lg px-1 py-1 hover:bg-gray-100 transition-colors"
        >
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Waves size={14} className="text-white" />
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-bold text-gray-800">ROV</p>
            <p className="text-xs text-gray-400">Management</p>
          </div>
        </button>
      </div>

      {/* Right: notification + avatar */}
      <div className="flex items-center gap-2">
        {/* Notification bell (placeholder) */}
        <button className="relative w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center transition-colors">
          <Bell size={18} />
          {/* Badge */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Avatar dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {/* Avatar circle */}
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            {/* Name + role — hidden on mobile */}
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-800 leading-tight">{user?.fullName}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_STYLE[user?.role]}`}>
                {user?.role}
              </span>
            </div>
            <ChevronDown size={14} className={`hidden sm:block text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
              {/* User info header */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800 truncate">{user?.fullName}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {menuItems.map(({ icon: Icon, label, action }) => (
                  <button
                    key={label}
                    onClick={() => { setDropdownOpen(false); action() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Icon size={15} className="text-gray-400" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Logout */}
              <div className="border-t border-gray-100 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
