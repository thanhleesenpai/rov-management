import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Anchor, Map, Briefcase, Users, X } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'operator', 'viewer'] },
  { to: '/rovs',      icon: Anchor,          label: 'ROVs',      roles: ['admin', 'operator', 'viewer'] },
  { to: '/trips',     icon: Map,             label: 'Trips',     roles: ['admin', 'operator', 'viewer'] },
  { to: '/jobs',      icon: Briefcase,       label: 'Jobs',      roles: ['admin', 'operator', 'viewer'] },
  { to: '/users',     icon: Users,           label: 'Users',     roles: ['admin'] }
]

export default function Sidebar({ collapsed, mobileOpen, onCloseMobile }) {
  const { user } = useAuthStore()
  const filtered = navItems.filter(item => item.roles.includes(user?.role))

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`
          hidden lg:flex flex-col shrink-0 bg-gray-900 text-white
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-16' : 'w-64'}
        `}
      >
          {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
          <div className={`space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
            {filtered.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center rounded-lg transition-colors duration-150 ${
                    collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{label}</span>}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-5 py-3 border-t border-gray-700">
            <p className="text-xs text-gray-500">v1.0.0</p>
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex flex-col
          transform transition-transform duration-300 ease-in-out lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Mobile header */}
        <div className="flex items-center justify-end px-4 h-16 border-b border-gray-700 shrink-0">
          <button onClick={onCloseMobile} className="text-gray-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {filtered.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-gray-700">
          <p className="text-xs text-gray-500">v1.0.0</p>
        </div>
      </aside>
    </>
  )
}
