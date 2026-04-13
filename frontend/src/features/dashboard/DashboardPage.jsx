import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Map, Briefcase, Anchor, Users, Clock } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Skeleton } from '@/components/shared/Skeleton'
import api from '@/lib/axios'

const STATUS_TRIP = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700' },
  completed: { text: 'Completed', cls: 'bg-gray-200 text-gray-600' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600' }
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  // Dùng status filter để đếm, limit=1 vì chỉ cần total
  const { data: rovs }       = useQuery({ queryKey: ['rovs',  { status: 'active' }],  queryFn: () => api.get('/rovs',  { params: { status: 'active',  limit: 1 } }).then(r => r.data) })
  const { data: trips }      = useQuery({ queryKey: ['trips', { limit: 5 }],          queryFn: () => api.get('/trips', { params: { limit: 5 } }).then(r => r.data) })
  const { data: jobs }       = useQuery({ queryKey: ['jobs',  { status: 'running' }], queryFn: () => api.get('/jobs',  { params: { status: 'running', limit: 1 } }).then(r => r.data) })
  const { data: allTrips }   = useQuery({ queryKey: ['trips', { limit: 1 }],          queryFn: () => api.get('/trips', { params: { limit: 1 } }).then(r => r.data) })
  const { data: users }      = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
    enabled: isAdmin
  })

  const activeROVs   = rovs?.total ?? null
  const totalTrips   = allTrips?.total ?? null
  const activeJobs   = jobs?.total ?? null
  const totalUsers   = users?.total ?? null

  const recentTrips  = trips?.data ?? []

  const statCards = [
    { label: 'Total Trips',     value: totalTrips,  icon: Map,      color: 'blue',   path: '/trips' },
    { label: 'Running Jobs',    value: activeJobs,  icon: Briefcase, color: 'green',  path: '/jobs' },
    { label: 'Active ROVs',     value: activeROVs,  icon: Anchor,   color: 'purple', path: '/rovs' },
    ...(isAdmin ? [{ label: 'Total Users', value: totalUsers, icon: Users, color: 'orange', path: '/users' }] : [])
  ]

  const colorMap = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   text: 'text-blue-600',   border: 'hover:border-blue-200' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600',  text: 'text-green-600',  border: 'hover:border-green-200' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', text: 'text-purple-600', border: 'hover:border-purple-200' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', text: 'text-orange-600', border: 'hover:border-orange-200' }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Welcome back, <span className="font-medium text-gray-700">{user?.fullName}</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 mb-8`}>
        {statCards.map(({ label, value, icon: Icon, color, path }) => {
          const c = colorMap[color]
          return (
            <button key={label} onClick={() => navigate(path)}
              className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left transition-all ${c.border} hover:shadow-md`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">{label}</p>
                <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center`}>
                  <Icon size={18} className={c.icon} />
                </div>
              </div>
              {value === null ? (
                <Skeleton className="h-8 w-12 mb-1" />
              ) : (
                <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
              )}
            </button>
          )
        })}
      </div>

      {/* Recent trips */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Trips</h2>
          <button onClick={() => navigate('/trips')} className="text-xs text-blue-600 hover:underline">View all</button>
        </div>

        {trips === undefined || allTrips === undefined ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : recentTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Map size={36} className="text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No trips yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTrips.map(trip => {
              const { text, cls } = STATUS_TRIP[trip.status] || STATUS_TRIP.planned
              return (
                <button key={trip._id} onClick={() => navigate(`/trips/${trip._id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                    <span className="text-sm font-medium text-gray-800">{trip.name}</span>
                    {trip.rov?.name && <span className="text-xs text-gray-400">{trip.rov.name}</span>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={11} />
                    {new Date(trip.createdAt).toLocaleDateString()}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
