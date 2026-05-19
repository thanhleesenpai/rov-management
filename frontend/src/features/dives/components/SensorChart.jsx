import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip
} from 'recharts'
import { AlertTriangle, MapPin, Activity } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import api from '@/lib/axios'

const METRICS = [
  { key: 'depth',    label: 'Depth (m)',      color: '#3b82f6', unit: 'm'   },
  { key: 'temp',     label: 'Temp (°C)',      color: '#f59e0b', unit: '°C'  },
  { key: 'pressure', label: 'Pressure (bar)', color: '#22c55e', unit: 'bar' },
]

const AXIS_PROPS = { tick: { fontSize: 10, fill: '#9ca3af' }, axisLine: false, tickLine: false }

function formatTs(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">{label ? new Date(label).toLocaleString() : ''}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">
            {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function AnomalyDot(props) {
  const { cx, cy, payload, dataKey, anomalySet } = props
  if (!cx || !cy || !payload) return null
  const isAnomaly = anomalySet.has(`${dataKey}:${payload.timestamp}`)
  if (!isAnomaly) return null
  return <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
}

export default function SensorChart({ dive }) {
  const diveId = dive._id
  const [hidden, setHidden] = useState({})

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sensor', diveId],
    queryFn: () => api.get(`/dives/${diveId}/sensor-data`).then(r => r.data),
    enabled: (dive.sensorCount || 0) > 0,
    staleTime: 5 * 60 * 1000,
  })

  const anomalySet = useMemo(() => {
    if (!data?.anomalies) return new Set()
    return new Set(data.anomalies.map(a => `${a.metric}:${a.timestamp}`))
  }, [data])

  const chartData = useMemo(() => data?.data ?? [], [data])

  const toggleMetric = (key) => setHidden(h => ({ ...h, [key]: !h[key] }))

  const hasGps = dive.gpsLocation?.lat != null && dive.gpsLocation?.lng != null

  if ((dive.sensorCount || 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity size={28} className="text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No sensor data uploaded yet.</p>
      </div>
    )
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (isError)   return <p className="text-xs text-destructive text-center py-6">Failed to load sensor data.</p>
  if (!chartData.length) return <p className="text-xs text-muted-foreground text-center py-6">No readings found.</p>

  const { stats, anomalies } = data

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          {METRICS.map(({ key, label, color, unit }) => {
            const s = stats[key]
            if (!s) return null
            return (
              <div key={key} className="bg-muted rounded-lg px-2.5 py-2 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <p className="text-xs font-semibold" style={{ color }}>
                  {s.min}–{s.max} {unit}
                </p>
                <p className="text-xs text-muted-foreground">avg {s.avg}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Chart */}
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          {METRICS.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleMetric(key)}
              className="flex items-center gap-1 text-xs transition-opacity"
              style={{ opacity: hidden[key] ? 0.35 : 1 }}
            >
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: color }} />
              <span className="text-muted-foreground">{label}</span>
            </button>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
            <XAxis dataKey="timestamp" tickFormatter={formatTs} {...AXIS_PROPS} interval="preserveStartEnd" />
            <YAxis {...AXIS_PROPS} allowDecimals />
            <Tooltip content={<CustomTooltip />} />
            {METRICS.map(({ key, color }) => (
              !hidden[key] && (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={1.5}
                  dot={(props) => <AnomalyDot {...props} dataKey={key} anomalySet={anomalySet} />}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Anomalies panel */}
      {anomalies?.length > 0 && (
        <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={13} className="text-yellow-600 dark:text-yellow-400 shrink-0" />
            <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
              {anomalies.length} anomal{anomalies.length === 1 ? 'y' : 'ies'} detected
            </p>
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {anomalies.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-2">
                <span className="text-yellow-700 dark:text-yellow-300 capitalize w-16 shrink-0">{a.metric}</span>
                <span className="font-mono text-yellow-800 dark:text-yellow-200">
                  {typeof a.value === 'number' ? a.value.toFixed(2) : a.value}
                </span>
                <span className="text-yellow-500 dark:text-yellow-400">z={a.zScore}</span>
                <span className="text-yellow-600 dark:text-yellow-400 ml-auto">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GPS badge — map will be in DiveDetailPage (Task 6) */}
      {hasGps && (
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <MapPin size={12} className="text-primary shrink-0" />
          <div className="min-w-0">
            {dive.locationName && (
              <p className="text-xs font-medium text-foreground truncate" title={dive.locationName}>
                {dive.locationName}
              </p>
            )}
            <p className="text-xs text-muted-foreground font-mono">
              {dive.gpsLocation.lat.toFixed(4)}, {dive.gpsLocation.lng.toFixed(4)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
