import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Map, Briefcase, Anchor, Users, Clock } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend
} from 'recharts'
import { useAuthStore } from '@/store/auth.store'
import { Skeleton } from '@/components/shared/Skeleton'
import api from '@/lib/axios'
import { TRIP_COLORS, DIVE_COLORS, ROV_PALETTE } from '@/lib/chartColors'

const STATUS_TRIP = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  completed: { text: 'Completed', cls: 'bg-muted text-muted-foreground' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' }
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-muted-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-semibold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children, loading, error, colSpan }) {
  return (
    <div className={`bg-card rounded-xl shadow-sm border border-border p-5 ${colSpan || ''}`}>
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      {loading ? <Skeleton className="h-40 w-full" />
        : error   ? <p className="text-xs text-destructive text-center py-10">Failed to load</p>
        : children}
    </div>
  )
}

function StatusPie({ data, colorMap }) {
  const entries = Object.entries(data).map(([key, value]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value,
    color: colorMap[key] || '#9ca3af'
  })).filter(e => e.value > 0)

  if (entries.length === 0) return <p className="text-xs text-muted-foreground text-center py-10">No data</p>

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={140}>
        <PieChart>
          <Pie data={entries} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
            {entries.map((e, i) => <Cell key={i} fill={e.color} />)}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 flex-1">
        {entries.map(e => (
          <div key={e.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
              <span className="text-muted-foreground">{e.name}</span>
            </div>
            <span className="font-semibold text-foreground">{e.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const AXIS_PROPS = {
  tick: { fontSize: 11, fill: '#9ca3af' },
  axisLine: false,
  tickLine: false,
}

export default function DashboardPage() {
const { user } = useAuthStore()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  const qOpts = { staleTime: 0, refetchOnWindowFocus: true }
  const { data: rovs }     = useQuery({ queryKey: ['rovs',  { status: 'active' }],  queryFn: () => api.get('/rovs',  { params: { status: 'active',  limit: 1 } }).then(r => r.data), ...qOpts })
  const { data: trips }    = useQuery({ queryKey: ['trips', { limit: 5 }],          queryFn: () => api.get('/trips', { params: { limit: 5 } }).then(r => r.data), ...qOpts })
  const { data: dives }    = useQuery({ queryKey: ['dives', { status: 'running' }], queryFn: () => api.get('/dives', { params: { status: 'running', limit: 1 } }).then(r => r.data), ...qOpts })
  const { data: allTrips } = useQuery({ queryKey: ['trips', { limit: 1 }],          queryFn: () => api.get('/trips', { params: { limit: 1 } }).then(r => r.data), ...qOpts })
  const { data: users }    = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data), enabled: isAdmin, ...qOpts })
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.get('/stats/overview').then(r => r.data),
    staleTime: 0, refetchOnWindowFocus: true, retry: 1
  })

  const activeROVs  = rovs?.total ?? null
  const totalTrips  = allTrips?.total ?? null
  const activeJobs  = dives?.total ?? null
  const totalUsers  = users?.total ?? null
  const recentTrips = trips?.data ?? []

  const statCards = [
    { label: 'Total Trips',  value: totalTrips, icon: Map,       color: 'blue',   path: '/trips' },
    { label: 'Running Dives', value: activeJobs, icon: Briefcase, color: 'green',  path: '/dives' },
    { label: 'Active ROVs',  value: activeROVs, icon: Anchor,    color: 'purple', path: '/rovs' },
    ...(isAdmin ? [{ label: 'Total Users', value: totalUsers, icon: Users, color: 'orange', path: '/users' }] : [])
  ]

  const colorMap = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: 'text-blue-600 dark:text-blue-400',   text: 'text-blue-600 dark:text-blue-400' },
    green:  { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', text: 'text-green-600 dark:text-green-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', text: 'text-purple-600 dark:text-purple-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400', text: 'text-orange-600 dark:text-orange-400' }
  }

  const diveBarData = stats ? [
    { name: 'Pending', value: stats.diveByStatus?.pending || 0, fill: DIVE_COLORS.pending },
    { name: 'Running', value: stats.diveByStatus?.running || 0, fill: DIVE_COLORS.running },
    { name: 'Done',    value: stats.diveByStatus?.done    || 0, fill: DIVE_COLORS.done },
    { name: 'Failed',  value: stats.diveByStatus?.failed  || 0, fill: DIVE_COLORS.failed },
  ] : []

  const chartProps = { loading: statsLoading, error: statsError }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Welcome back, <span className="font-medium text-foreground">{user?.fullName}</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className={`grid grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 sm:gap-4 mb-6`}>
        {statCards.map(({ label, value, icon: Icon, color, path }) => {
          const c = colorMap[color]
          return (
            <button key={label} onClick={() => navigate(path)}
              className="bg-card rounded-xl shadow-sm border border-border p-4 sm:p-5 text-left transition-all hover:shadow-md hover:border-muted-foreground/20">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{label}</p>
                <div className={`w-8 h-8 sm:w-9 sm:h-9 ${c.bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <Icon size={16} className={c.icon} />
                </div>
              </div>
              {value === null ? <Skeleton className="h-7 w-10" /> : (
                <p className={`text-2xl sm:text-3xl font-bold ${c.text}`}>{value}</p>
              )}
            </button>
          )
        })}
      </div>

      {/* Row 1: Status pies + jobs bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Trip Status" {...chartProps}>
          {stats && <StatusPie data={stats.tripByStatus} colorMap={TRIP_COLORS} />}
        </ChartCard>

        <ChartCard title="Dives by Status" {...chartProps}>
          {stats && (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={diveBarData} barSize={28} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--muted))' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {diveBarData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="ROV Utilization" {...chartProps}>
          {stats && (stats.rovUtilization?.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={stats.rovUtilization} barSize={20} layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--muted))' }} />
                <Bar dataKey="trips" name="Trips" radius={[0, 4, 4, 0]}>
                  {stats.rovUtilization.map((_, i) => <Cell key={i} fill={ROV_PALETTE[i % ROV_PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ))}
        </ChartCard>
      </div>

      {/* Row 2: Activity timeline */}
      <div className="mb-6">
        <ChartCard title="Activity (last 6 months)" {...chartProps}>
          {stats && (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={stats.activityTimeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="trips" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="dives" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="media" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Recent trips */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Recent Trips</h2>
          <button onClick={() => navigate('/trips')} className="text-xs text-primary hover:underline">View all</button>
        </div>

        {trips === undefined || allTrips === undefined ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : recentTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Map size={36} className="text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">No trips yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentTrips.map(trip => {
              const { text, cls } = STATUS_TRIP[trip.status] || STATUS_TRIP.planned
              return (
                <button key={trip._id} onClick={() => navigate(`/trips/${trip._id}`)}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-muted transition-colors text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cls}`}>{text}</span>
                    <span className="text-sm font-medium text-foreground truncate">{trip.name}</span>
                    {trip.rov?.name && <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">{trip.rov.name}</span>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-2">
                    <Clock size={11} />
                    <span className="hidden sm:inline">{new Date(trip.createdAt).toLocaleDateString()}</span>
                    <span className="sm:hidden">{new Date(trip.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
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
