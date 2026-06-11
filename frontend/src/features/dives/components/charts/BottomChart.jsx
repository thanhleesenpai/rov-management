import React from 'react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Brush,
} from 'recharts'
import { Activity } from 'lucide-react'

// ─── Metric definitions ───────────────────────────────────────────────────────

// Environment: depth (left axis, m) + water temperature (right axis, °C).
// Depth values are negative (0 = surface, -30 = 30 m deep) so Recharts'
// default domain naturally places surface at top and deeper at bottom.
const ENV_METRICS = [
  { key: 'depth', label: 'Depth',      unit: 'm',  color: '#0891b2', axis: 'left'  },
  { key: 'temp',  label: 'Water Temp', unit: '°C', color: '#f59e0b', axis: 'right' },
]

// Navigation: orientation
const NAV_METRICS = [
  { key: 'yaw',   label: 'Yaw',   color: '#8b5cf6' },
  { key: 'pitch', label: 'Pitch', color: '#06b6d4' },
  { key: 'roll',  label: 'Roll',  color: '#f97316' },
]

// System: axis 'left' = % scale (0–100), 'right' = voltage/temp scale
const SYS_METRICS = [
  { key: 'humidity',    label: 'Humidity',    unit: '%',  color: '#10b981', axis: 'left'  },
  { key: 'powerLevel',  label: 'Power Level', unit: '%',  color: '#a855f7', axis: 'left'  },
  { key: 'voltage',     label: 'Voltage',     unit: 'V',  color: '#f59e0b', axis: 'right' },
  { key: 'temperature', label: 'Board Temp',  unit: '°C', color: '#f43f5e', axis: 'right' },
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

const AXIS = { tick: { fontSize: 9, fill: '#9ca3af', fontFamily: 'JetBrains Mono, monospace' }, axisLine: false, tickLine: false }

// ─── Shared sub-components ────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold font-mono text-foreground tabular-nums">
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

function LegendToggle({ metrics, hidden, setHidden, chartData, showDemoNote }) {
  return (
    <div className="hidden sm:flex items-center gap-3 mr-4 flex-nowrap overflow-x-auto max-w-[240px]" style={{ scrollbarWidth: 'none' }}>
      {metrics.map(({ key, label, color }) => {
        const hasData = chartData.some(d => d[key] != null)
        if (!hasData) return null
        return (
          <button key={key}
            onClick={() => setHidden(h => ({ ...h, [key]: !h[key] }))}
            style={{ opacity: hidden[key] ? 0.25 : 1 }}
            className="flex items-center gap-1.5 text-[10px] transition-opacity select-none">
            <span className="w-4 h-0.5 rounded inline-block" style={{ background: color }} />
            <span className="text-muted-foreground">{label}</span>
          </button>
        )
      })}
      {showDemoNote && <span className="text-[9px] text-muted-foreground italic ml-1">demo data</span>}
    </div>
  )
}

// ─── BottomChart ─────────────────────────────────────────────────────────────

export function BottomChart({
  chartExpanded, chartTab, setChartTab,
  hidden, setHidden,
  hasNavData, hasPowerData,
  chartData, syncIdx, anomalySet,
  isDark, hasSensor,
  extraRight,   // extra node rendered at far-right of tab bar
  variant = 'bottom',  // 'bottom' | 'inline'
}) {
  const brushProps = {
    dataKey: 'timestamp', height: 18, travellerWidth: 5, tickFormatter: fmtTime,
    stroke: isDark ? '#374151' : '#e5e7eb',
    fill:   isDark ? '#1f2937' : '#f9fafb',
    tick: { fontSize: 8, fill: '#9ca3af' },
  }

  const refLine = (yAxisId) =>
    syncIdx != null && chartData[syncIdx] ? (
      <ReferenceLine yAxisId={yAxisId}
        x={chartData[syncIdx].timestamp}
        stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
        label={{ value: '▶', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
      />
    ) : null

  const outerCls = variant === 'inline'
    ? `flex-none flex flex-col bg-card border border-border rounded-xl
       transition-[height] duration-300 ${chartExpanded ? 'h-80' : 'h-44'}`
    : `flex-none flex flex-col bg-card border-t border-border
       transition-[height] duration-300 ${chartExpanded ? 'h-80' : 'h-44'}`

  return (
    <div className={outerCls}>

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

        {extraRight && <div className="mr-2">{extraRight}</div>}

        {chartTab === 'env' && (
          <LegendToggle metrics={ENV_METRICS} hidden={hidden} setHidden={setHidden} chartData={chartData} />
        )}
        {chartTab === 'nav' && (
          <LegendToggle
            metrics={NAV_METRICS}
            hidden={hidden} setHidden={setHidden}
            chartData={hasNavData ? chartData : MOCK_YPR.map(d => ({ yaw: d.yaw, pitch: d.pitch, roll: d.roll }))}
            showDemoNote={!hasNavData}
          />
        )}
        {chartTab === 'power' && (
          <LegendToggle metrics={SYS_METRICS} hidden={hidden} setHidden={setHidden} chartData={chartData} />
        )}
      </div>

      <div className="flex-1 min-h-0 relative p-3">

        {/* ── ENVIRONMENT: Depth (left, m) + Water Temp (right, °C) ── */}
        {chartTab === 'env' && (
          chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 44, left: -12, bottom: 0 }}>
                <defs>
                  {ENV_METRICS.map(({ key, color }) => (
                    <linearGradient key={key} id={`g_${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={fmtTime} {...AXIS} interval="preserveStartEnd" />
                {/* Left axis: depth (m) — negative values, surface at top by default */}
                <YAxis yAxisId="left"  {...AXIS} width={32} unit="m" />
                {/* Right axis: water temperature (°C) */}
                <YAxis yAxisId="right" {...AXIS} width={36} orientation="right" unit="°C" />
                <Tooltip content={<ChartTooltip />} />
                {syncIdx != null && chartData[syncIdx] && (
                  <ReferenceLine yAxisId="left" x={chartData[syncIdx].timestamp}
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
                    label={{ value: '▶', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                  />
                )}
                <Brush {...brushProps} />
                {ENV_METRICS.map(({ key, label, color, axis }) => {
                  const hasData = chartData.some(d => d[key] != null)
                  if (!hasData || hidden[key]) return null
                  return (
                    <Area key={key} yAxisId={axis} type="monotone" dataKey={key} name={label}
                      stroke={color} strokeWidth={1.5} fill={`url(#g_${key})`}
                      dot={(p) => <AnomalyDot {...p} dataKey={key} anomalySet={anomalySet} />}
                      activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
                  )
                })}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState hasSensor={hasSensor} />
          )
        )}

        {/* ── NAVIGATION ────────────────────────────────── */}
        {chartTab === 'nav' && (
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
                  <ReferenceLine x={chartData[syncIdx].timestamp}
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
                    label={{ value: '▶', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                  />
                )}
                {!hidden.yaw && (
                  <Line type="monotone" dataKey="yaw"   name="Yaw"   stroke="#8b5cf6" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                )}
                {!hidden.pitch && (
                  <Line type="monotone" dataKey="pitch" name="Pitch" stroke="#06b6d4" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                )}
                {!hidden.roll && (
                  <Line type="monotone" dataKey="roll"  name="Roll"  stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                )}
                {hasNavData && <Brush {...brushProps} />}
              </LineChart>
            </ResponsiveContainer>
            {!hasNavData && (
              <div className="absolute bottom-6 right-3 text-[9px] text-muted-foreground/40 pointer-events-none select-none">
                demo data
              </div>
            )}
          </div>
        )}

        {/* ── SYSTEM ────────────────────────────────────── */}
        {chartTab === 'power' && (
          hasPowerData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 44, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={fmtTime} {...AXIS} interval="preserveStartEnd" />
                <YAxis yAxisId="left"  {...AXIS} width={28} unit="%" domain={[0, 100]} />
                <YAxis yAxisId="right" {...AXIS} width={32} unit="V" orientation="right" />
                <Tooltip content={<ChartTooltip />} />
                {refLine('left')}
                {SYS_METRICS.map(({ key, label, color, axis }) => {
                  const hasData = chartData.some(d => d[key] != null)
                  if (!hasData || hidden[key]) return null
                  return (
                    <Line key={key} yAxisId={axis} type="monotone" dataKey={key} name={label}
                      stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  )
                })}
                <Brush {...brushProps} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState hasSensor={hasSensor} message="No system data in this file" />
          )
        )}
      </div>
    </div>
  )
}

function EmptyState({ hasSensor, message }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
      <Activity size={22} className="text-muted-foreground/30" />
      <p className="text-xs text-muted-foreground">
        {message ?? (hasSensor ? 'No readings found' : 'No sensor data uploaded yet')}
      </p>
    </div>
  )
}
