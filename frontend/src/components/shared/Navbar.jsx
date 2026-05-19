import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, PanelLeftClose, PanelLeftOpen, User, Settings, KeyRound, LogOut, ChevronDown, Waves, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import api from '@/lib/axios'
import NotificationBell from './NotificationBell'
import { useSSE } from '@/hooks/useSSE'

const ROLE_STYLE = {
  admin:    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  operator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  viewer:   'bg-muted text-muted-foreground',
}

export default function Navbar({ collapsed, onToggleCollapse, onOpenMobile }) {
  const { user, logout } = useAuthStore()
  const { isDark, toggle: toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  useSSE()

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
    { icon: User,     label: 'My Profile',     action: () => navigate('/profile') },
    { icon: KeyRound, label: 'Change Password', action: () => navigate('/profile?tab=password') },
    { icon: Settings, label: 'Settings',        action: () => navigate('/profile?tab=settings') },
  ]

  const initials = user?.fullName
    ?.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase() || '?'

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 shrink-0 relative z-40">
      {/* Left */}
      <div className="flex items-center gap-2">
        <button onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button onClick={onOpenMobile}
          className="flex lg:hidden items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
          <Menu size={18} />
        </button>
        <button onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 ml-1 rounded-lg px-1 py-1 hover:bg-muted transition-colors">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <Waves size={14} className="text-primary-foreground" />
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-bold text-foreground">ROV</p>
            <p className="text-xs text-muted-foreground">Management</p>
          </div>
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ${
            isDark ? 'bg-primary/30' : 'bg-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-all duration-300 ${
              isDark ? 'bg-amber-400 translate-x-7' : 'bg-card translate-x-0'
            }`}
          >
            {isDark
              ? <Moon size={13} className="text-slate-900" />
              : <Sun size={13} className="text-orange-400" />
            }
          </span>
        </button>

        <NotificationBell />

        {/* Avatar dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
            {user?.avatar
              ? <img src={user.avatar} alt="avatar" className="w-8 h-8 rounded-full object-cover shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground text-xs font-bold">{initials}</span>
                </div>
            }
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-foreground leading-tight">{user?.fullName}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_STYLE[user?.role]}`}>
                {user?.role}
              </span>
            </div>
            <ChevronDown size={14} className={`hidden sm:block text-muted-foreground transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-card rounded-xl shadow-lg border border-border py-1 z-50">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground truncate">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                {menuItems.map(({ icon: Icon, label, action }) => (
                  <button key={label} onClick={() => { setDropdownOpen(false); action() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                    <Icon size={15} className="text-muted-foreground" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="border-t border-border py-1">
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
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
