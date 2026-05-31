import React from 'react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Brush,
} from 'recharts'
import { Activity } from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────

const ENV_METRICS = [
  { key: 'depth',    label: 'Depth',    unit: 'm',   color: '#3b82f6' },
  { key: 'temp',     label: 'Temp',     unit: '°C',  color: '#f59e0b' },
  { key: 'pressure', label: 'Pressure', unit: 'bar', color: '#10b981' },
]

const NAV_METRICS = [
  { key: 'yaw',   label: 'Yaw',   color: '#8b5cf6' },
  { key: 'pitch', label: 'Pitch', color: '#06b6d4' },
  { key: 'roll',  label: 'Roll',  color: '#f97316' },
]

const POWER_METRICS = [
  { key: 'battery_percent', label: 'Battery', unit: '%', color: '#3b82f6', axis: 'left'  },
  { key: 'humidity',        label: 'Humidity', unit: '%', color: '#10b981', axis: 'left'  },
  { key: 'voltage',         label: 'Voltage',  unit: 'V', color: '#f59e0b', axis: 'right' },
]

const MOCK_YPR = Array.from({ length: 24 }, (_, i) => ({
  t:     `+${i * 5}m`,
  yaw:   +(Math.sin(i * 0.42) * 40 + 120).toFixed(1),
  pitch: +(Math.cos(i * 0.71) * 5).toFixed(1),
  roll:  +(Math.sin(i * 1.15 + 0.8) * 9).toFixed(1),
}))

export function fmtTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const AXIS = { tick: { fontSize: 9, fill: '#9ca3af' }, axisLine: false, tickLine: false }

// ─── Sub-components ──────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground tabular-nums">
            {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function AnomalyDot({ cx, cy, payload, dataKey, anomalySet }) {
  if (!cx || !cy || !payload) return null
  if (!anomalySet.has(`${dataKey}:${payload.timestamp}`)) return null
  return <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={2} />
}

// ─── BottomChart ─────────────────────────────────────────────────────────────

export function BottomChart({
  chartExpanded,
  chartTab,
  setChartTab,
  hidden,
  setHidden,
  hasNavData,
  hasPowerData,
  chartData,
  syncIdx,
  anomalySet,
  isDark,
  hasSensor
}) {
  return (
    <div className={`flex-none flex flex-col bg-card border-t border-border
                     transition-[height] duration-300
                     ${chartExpanded ? 'h-80' : 'h-44'}`}>

      {/* Tab bar */}
      <div className="h-9 flex-none flex items-center px-4 border-b border-border shrink-0">
        {[
          { id: 'env',   label: 'Environment' },
          { id: 'nav',   label: 'Navigation'  },
          { id: 'power', label: 'System'       },
        ].map(tab => (
          <button key={tab.id} onClick={() => setChartTab(tab.id)}
            className={`px-4 h-9 text-xs font-semibold transition-colors border-b-2 -mb-px mr-1 ${
              chartTab === tab.id
                ? 'text-foreground border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Legend toggles */}
        {chartTab === 'env' && (
          <div className="hidden sm:flex items-center gap-3 mr-4">
            {ENV_METRICS.map(({ key, label, color }) => (
              <button key={key}
                onClick={() => setHidden(h => ({ ...h, [key]: !h[key] }))}
                style={{ opacity: hidden[key] ? 0.25 : 1 }}
                className="flex items-center gap-1.5 text-[10px] transition-opacity select-none">
                <span className="w-4 h-0.5 rounded inline-block" style={{ background: color }} />
                <span className="text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
        )}
        {chartTab === 'nav' && (
          <div className="hidden sm:flex items-center gap-3 mr-4">
            {NAV_METRICS.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-1.5 text-[10px] opacity-50">
                <span className="w-4 h-0.5 rounded inline-block" style={{ background: color }} />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
            {!hasNavData && (
              <span className="text-[9px] text-muted-foreground italic ml-1">demo data</span>
            )}
          </div>
        )}
        {chartTab === 'power' && (
          <div className="hidden sm:flex items-center gap-3 mr-4">
            {POWER_METRICS.map(({ key, label, color }) => (
              <button key={key}
                onClick={() => setHidden(h => ({ ...h, [key]: !h[key] }))}
                style={{ opacity: hidden[key] ? 0.25 : 1 }}
                className="flex items-center gap-1.5 text-[10px] transition-opacity select-none">
                <span className="w-4 h-0.5 rounded inline-block" style={{ background: color }} />
                <span className="text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 relative p-3">
        {chartTab === 'env' ? (
          chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 36, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2}/><stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="100%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={fmtTime} {...AXIS} interval="preserveStartEnd" />
                <YAxis {...AXIS} width={28} />
                <Tooltip content={<ChartTooltip />} />

                {syncIdx != null && chartData[syncIdx] && (
                  <ReferenceLine
                    x={chartData[syncIdx].timestamp}
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
                    label={{ value: '▶', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                  />
                )}

                <Brush
                  dataKey="timestamp" height={18} travellerWidth={5} tickFormatter={fmtTime}
                  stroke={isDark ? '#374151' : '#e5e7eb'}
                  fill={isDark ? '#1f2937' : '#f9fafb'}
                  tick={{ fontSize: 8, fill: '#9ca3af' }}
                />

                {!hidden.depth && (
                  <Area type="monotone" dataKey="depth" name="Depth"
                    stroke="#3b82f6" strokeWidth={1.5} fill="url(#gD)"
                    dot={(p) => <AnomalyDot {...p} dataKey="depth" anomalySet={anomalySet} />}
                    activeDot={{ r: 4 }} isAnimationActive={false} />
                )}
                {!hidden.temp && (
                  <Area type="monotone" dataKey="temp" name="Temp"
                    stroke="#f59e0b" strokeWidth={1.5} fill="url(#gT)"
                    dot={(p) => <AnomalyDot {...p} dataKey="temp" anomalySet={anomalySet} />}
                    activeDot={{ r: 4 }} isAnimationActive={false} />
                )}
                {!hidden.pressure && (
                  <Area type="monotone" dataKey="pressure" name="Pressure"
                    stroke="#10b981" strokeWidth={1.5} fill="url(#gP)"
                    dot={(p) => <AnomalyDot {...p} dataKey="pressure" anomalySet={anomalySet} />}
                    activeDot={{ r: 4 }} isAnimationActive={false} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Activity size={22} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                {hasSensor ? 'No readings found' : 'No sensor data uploaded yet'}
              </p>
            </div>
          )
        ) : chartTab === 'nav' ? (
          <div className="relative w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={hasNavData ? chartData : MOCK_YPR}
                margin={{ top: 4, right: 28, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis
                  dataKey={hasNavData ? 'timestamp' : 't'}
                  tickFormatter={hasNavData ? fmtTime : undefined}
                  {...AXIS} interval="preserveStartEnd" />
                <YAxis {...AXIS} width={28} unit="°" />
                <Tooltip content={<ChartTooltip />} />

                {hasNavData && syncIdx != null && chartData[syncIdx] && (
                  <ReferenceLine
                    x={chartData[syncIdx].timestamp}
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    label={{ value: '▶', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                  />
                )}

                <Line type="monotone" dataKey="yaw"   stroke="#8b5cf6" strokeWidth={1.5}
                  dot={false} name="Yaw"   isAnimationActive={false} />
                <Line type="monotone" dataKey="pitch" stroke="#06b6d4" strokeWidth={1.5}
                  dot={false} name="Pitch" isAnimationActive={false} />
                <Line type="monotone" dataKey="roll"  stroke="#f97316" strokeWidth={1.5}
                  dot={false} name="Roll"  isAnimationActive={false} />

                {hasNavData && (
                  <Brush
                    dataKey="timestamp"
                    height={18}
                    travellerWidth={5}
                    tickFormatter={fmtTime}
                    stroke={isDark ? '#374151' : '#e5e7eb'}
                    fill={isDark ? '#1f2937' : '#f9fafb'}
                    tick={{ fontSize: 8, fill: '#9ca3af' }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            {!hasNavData && (
              <div className="absolute bottom-6 right-3 text-[9px] text-muted-foreground/40 pointer-events-none select-none">
                demo data
              </div>
            )}
          </div>
        ) : (
          /* ── POWER TAB ─────────────────────────────────────────── */
          hasPowerData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 36, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={fmtTime}
                  {...AXIS} interval="preserveStartEnd" />
                <YAxis yAxisId="left"  {...AXIS} width={28} unit="%" domain={[0, 100]} />
                <YAxis yAxisId="right" {...AXIS} width={32} unit="V" orientation="right" />
                <Tooltip content={<ChartTooltip />} />

                {syncIdx != null && chartData[syncIdx] && (
                  <ReferenceLine yAxisId="left"
                    x={chartData[syncIdx].timestamp}
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
                    label={{ value: '▶', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                  />
                )}

                {!hidden.battery_percent && (
                  <Line yAxisId="left" type="monotone" dataKey="battery_percent"
                    name="Battery" stroke="#3b82f6" strokeWidth={1.5}
                    dot={false} isAnimationActive={false} />
                )}
                {!hidden.humidity && (
                  <Line yAxisId="left" type="monotone" dataKey="humidity"
                    name="Humidity" stroke="#10b981" strokeWidth={1.5}
                    dot={false} isAnimationActive={false} />
                )}
                {!hidden.voltage && (
                  <Line yAxisId="right" type="monotone" dataKey="voltage"
                    name="Voltage" stroke="#f59e0b" strokeWidth={1.5}
                    dot={(p) => <AnomalyDot {...p} dataKey="voltage" anomalySet={anomalySet} />}
                    activeDot={{ r: 4 }} isAnimationActive={false} />
                )}

                <Brush
                  dataKey="timestamp"
                  height={18}
                  travellerWidth={5}
                  tickFormatter={fmtTime}
                  stroke={isDark ? '#374151' : '#e5e7eb'}
                  fill={isDark ? '#1f2937' : '#f9fafb'}
                  tick={{ fontSize: 8, fill: '#9ca3af' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Activity size={22} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                {hasSensor ? 'No power data in this file' : 'No sensor data uploaded yet'}
              </p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
