import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Map, Briefcase, Anchor, Users, Clock, ChevronRight, MapPin } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Legend
} from 'recharts'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { Skeleton } from '@/components/shared/Skeleton'
import EmptyState from '@/components/shared/EmptyState'
import api from '@/lib/axios'
import { TRIP_COLORS, DIVE_COLORS, ROV_PALETTE, LINE_COLORS } from '@/lib/chartColors'
import {
  MarineTable, MarineTableHeader, MarineTableBody,
  MarineTableRow, MarineTableHead, MarineTableCell, MarineTableStatus
} from '@/components/bespoke/MarineTable'
import { MarineButton } from '@/components/bespoke/MarineButton'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover/95 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl px-3 py-2.5 outline-none pointer-events-none">
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color || p.fill }} />
          <span className="font-mono text-xs text-muted-foreground capitalize">{p.name}</span>
          <span className="font-mono text-xs font-semibold text-foreground ml-auto pl-4">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children, loading, error, colSpan }) {
  return (
    <div className={`bg-card rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 ${colSpan || ''}`}>
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      {loading ? <Skeleton className="h-40 w-full" />
        : error ? <p className="text-xs text-destructive text-center py-10">Failed to load</p>
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
        <PieChart style={{ outline: 'none' }}>
          <Pie data={entries} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={60} paddingAngle={3} stroke="none" style={{ outline: 'none' }}>
            {entries.map((e, i) => <Cell key={i} fill={e.color} style={{ outline: 'none' }} />)}
          </Pie>
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
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
  const { isDark } = useThemeStore()
  const navigate = useNavigate()
  // Near-invisible gridlines: very dark on dark bg, very light on light bg
  const gridColor = isDark ? '#1e293b' : '#e2e8f0'
  const isAdmin = user?.role === 'admin'

  const qOpts = { staleTime: 0, refetchOnWindowFocus: true }
  const { data: rovs } = useQuery({ queryKey: ['rovs', { status: 'active' }], queryFn: () => api.get('/rovs', { params: { status: 'active', limit: 1 } }).then(r => r.data), ...qOpts })
  const { data: trips } = useQuery({ queryKey: ['trips', { limit: 5 }], queryFn: () => api.get('/trips', { params: { limit: 5 } }).then(r => r.data), ...qOpts })
  const { data: dives } = useQuery({ queryKey: ['dives', { status: 'running' }], queryFn: () => api.get('/dives', { params: { status: 'running', limit: 1 } }).then(r => r.data), ...qOpts })
  const { data: allTrips } = useQuery({ queryKey: ['trips', { limit: 1 }], queryFn: () => api.get('/trips', { params: { limit: 1 } }).then(r => r.data), ...qOpts })
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data), enabled: isAdmin, ...qOpts })
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: () => api.get('/stats/overview').then(r => r.data),
    staleTime: 0, refetchOnWindowFocus: true, retry: 1
  })

  const activeROVs = rovs?.total ?? null
  const totalTrips = allTrips?.total ?? null
  const activeJobs = dives?.total ?? null
  const totalUsers = users?.total ?? null
  const recentTrips = trips?.data ?? []

  const statCards = [
    { label: 'Total Trips', value: totalTrips, icon: Map, color: 'blue', path: '/trips' },
    { label: 'Running Dives', value: activeJobs, icon: Briefcase, color: 'green', path: '/dives' },
    { label: 'Active ROVs', value: activeROVs, icon: Anchor, color: 'purple', path: '/rovs' },
    ...(isAdmin ? [{ label: 'Total Users', value: totalUsers, icon: Users, color: 'orange', path: '/users' }] : [])
  ]

  const colorMap = {
    blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400', text: 'text-blue-600 dark:text-blue-400' },
    green: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', text: 'text-green-600 dark:text-green-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', text: 'text-purple-600 dark:text-purple-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400', text: 'text-orange-600 dark:text-orange-400' }
  }

  const diveBarData = stats ? [
    { name: 'Pending', value: stats.diveByStatus?.pending || 0, fill: DIVE_COLORS.pending },
    { name: 'Running', value: stats.diveByStatus?.running || 0, fill: DIVE_COLORS.running },
    { name: 'Done', value: stats.diveByStatus?.done || 0, fill: DIVE_COLORS.done },
    { name: 'Failed', value: stats.diveByStatus?.failed || 0, fill: DIVE_COLORS.failed },
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
              className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-5 text-left transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold leading-tight">{label}</p>
                <div className={`w-8 h-8 sm:w-9 sm:h-9 ${c.bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <Icon size={16} className={c.icon} />
                </div>
              </div>
              {value === null ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-2xl sm:text-3xl font-mono font-medium text-foreground">{value}</p>
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
              <BarChart data={diveBarData} maxBarSize={32} margin={{ top: 0, right: 4, left: -20, bottom: 0 }} style={{ outline: 'none' }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
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
              <BarChart data={stats.rovUtilization} maxBarSize={28} layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }} style={{ outline: 'none' }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
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
              <AreaChart data={stats.activityTimeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }} style={{ outline: 'none' }}>
                <defs>
                  <linearGradient id="grad-trips" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={LINE_COLORS.trips} stopOpacity={0.30} />
                    <stop offset="95%" stopColor={LINE_COLORS.trips} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-dives" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={LINE_COLORS.dives} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={LINE_COLORS.dives} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-media" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={LINE_COLORS.media} stopOpacity={0.20} />
                    <stop offset="95%" stopColor={LINE_COLORS.media} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="trips" stroke={LINE_COLORS.trips} strokeWidth={2}
                  fill="url(#grad-trips)" fillOpacity={1}
                  dot={{ r: 2, fill: LINE_COLORS.trips }} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="dives" stroke={LINE_COLORS.dives} strokeWidth={2}
                  fill="url(#grad-dives)" fillOpacity={1}
                  dot={{ r: 2, fill: LINE_COLORS.dives }} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="media" stroke={LINE_COLORS.media} strokeWidth={2}
                  fill="url(#grad-media)" fillOpacity={1}
                  dot={{ r: 2, fill: LINE_COLORS.media }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Recent trips */}
      <div className="mb-4 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Recent Trips</h2>
        <MarineButton variant="outline" onClick={() => navigate('/trips')}>
          <span className="hidden sm:inline">View All Trips</span>
          <span className="sm:hidden">View All</span>
        </MarineButton>
      </div>

      {trips === undefined || allTrips === undefined ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : recentTrips.length === 0 ? (
        <EmptyState
          icon={Map}
          title="No trips yet"
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden xl:block">
            <MarineTable>
              <MarineTableHeader>
                <MarineTableRow>
                  <MarineTableHead>Name</MarineTableHead>
                  <MarineTableHead>ROV</MarineTableHead>
                  <MarineTableHead>Location</MarineTableHead>
                  <MarineTableHead>Dates</MarineTableHead>
                  <MarineTableHead>Status</MarineTableHead>
                  <MarineTableHead align="right"></MarineTableHead>
                </MarineTableRow>
              </MarineTableHeader>
              <MarineTableBody>
                {recentTrips.map(trip => {
                  const label = trip.status.charAt(0).toUpperCase() + trip.status.slice(1)
                  return (
                    <MarineTableRow key={trip._id} onClick={() => navigate(`/trips/${trip._id}`)}>
                      <MarineTableCell>
                        <Link to={`/trips/${trip._id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-foreground hover:text-cyan-600 transition-colors truncate block w-fit">
                          {trip.name}
                        </Link>
                      </MarineTableCell>
                      <MarineTableCell>
                        {trip.rov ? (
                          <Link to={`/rovs/${trip.rov._id}`} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer truncate"
                            title={trip.rov.name}>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">ROV</span>
                            <span className="text-sm font-mono text-foreground">{trip.rov.name.replace(/^ROV\s+/i, '')}</span>
                          </Link>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        {trip.location ? (
                          <span className="truncate max-w-xs block" title={trip.location}>{trip.location}</span>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell isMono>
                        {trip.startTime ? (
                          <span title={trip.endTime ? `${new Date(trip.startTime).toLocaleDateString()} → ${new Date(trip.endTime).toLocaleDateString()}` : new Date(trip.startTime).toLocaleDateString()}>
                            {new Date(trip.startTime).toLocaleDateString()}
                            {trip.endTime && ` → ${new Date(trip.endTime).toLocaleDateString()}`}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        <MarineTableStatus status={trip.status} label={label} />
                      </MarineTableCell>
                      <MarineTableCell align="right">
                        <ChevronRight size={18} className="text-slate-300 dark:text-slate-500 group-hover:text-cyan-600 group-hover:translate-x-1 transition-all duration-200 ml-auto" />
                      </MarineTableCell>
                    </MarineTableRow>
                  )
                })}
              </MarineTableBody>
            </MarineTable>
          </div>

          {/* Mobile card list */}
          <div className="xl:hidden space-y-2">
            {recentTrips.map(trip => {
              const label = trip.status.charAt(0).toUpperCase() + trip.status.slice(1)
              return (
                <div key={trip._id} onClick={() => navigate(`/trips/${trip._id}`)}
                  className="bg-card rounded-lg border border-border shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[200px] sm:max-w-xs">
                          {trip.name}
                        </span>
                        <MarineTableStatus status={trip.status} label={label} />
                      </div>

                      <div className="flex flex-col gap-1.5 mt-2">
                        {trip.rov && (
                          <div onClick={e => { e.stopPropagation(); navigate(`/rovs/${trip.rov._id}`) }}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer w-fit">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">ROV</span>
                            <span className="text-sm font-mono text-foreground">{trip.rov.name.replace(/^ROV\s+/i, '')}</span>
                          </div>
                        )}

                        {(trip.location || trip.startTime) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {trip.location && (
                              <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                                <MapPin size={11} className="shrink-0 text-muted-foreground" />
                                <span className="truncate max-w-[120px]">{trip.location}</span>
                              </div>
                            )}
                            {trip.startTime && (
                              <div className="flex items-center gap-1 text-sm font-mono text-foreground">
                                <Clock size={11} className="shrink-0 text-muted-foreground" />
                                <span>
                                  {new Date(trip.startTime).toLocaleDateString()}
                                  {trip.endTime && ` → ${new Date(trip.endTime).toLocaleDateString()}`}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pl-2 self-center">
                      <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
