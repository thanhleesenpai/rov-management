import os

file_path = r"d:\Code\rov-management\frontend\src\features\dives\DiveDetailPage.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
imports_target = "import ConfirmDialog from '@/components/shared/ConfirmDialog'\nimport 'leaflet/dist/leaflet.css'"
imports_replacement = """import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { KpiCard } from './components/ui/KpiCard'
import { SectionLabel } from './components/ui/SectionLabel'
import { DiveHeader } from './components/layout/DiveHeader'
import { LocationPanel } from './components/layout/LocationPanel'
import { AlertsPanel } from './components/layout/AlertsPanel'
import DiveMap from './components/DiveMap'
import { BottomChart } from './components/charts/BottomChart'
import 'leaflet/dist/leaflet.css'"""
content = content.replace(imports_target, imports_replacement)

# 2. DiveMap
divemap_target = """// ─── Leaflet map ──────────────────────────────────────────────────────────────

function DiveMap({ lat, lng }) {
  const ref  = useRef(null)
  const inst = useRef(null)

  useEffect(() => {
    if (!ref.current || inst.current) return
    import('leaflet').then(({ default: L }) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:#3b82f6;border:2px solid white;
               border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,.8)"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      })
      const map = L.map(ref.current, { zoomControl: false, attributionControl: false })
        .setView([lat, lng], 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
      L.marker([lat, lng], { icon }).addTo(map)
      inst.current = map
    })
    return () => { if (inst.current) { inst.current.remove(); inst.current = null } }
  }, [lat, lng])

  return <div ref={ref} className="w-full h-full" />
}"""
content = content.replace(divemap_target, "// ─── Leaflet map (Extracted) ──────────────────────────────────────────────────")

# 3. Chart tooltip & AnomalyDot
tooltip_target = """// ─── Chart tooltip ────────────────────────────────────────────────────────────

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
}"""
content = content.replace(tooltip_target, "")

# 4. KpiCard and SectionLabel
kpicard_target = """// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, color }) {
  return (
    <div className="bg-background rounded-lg px-2.5 py-2 lg:px-3 lg:py-1.5 2xl:px-4 2xl:py-3 flex flex-col lg:flex-row 2xl:flex-col items-start lg:items-center 2xl:items-start justify-between">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5 lg:mb-0 2xl:mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-lg lg:text-base 2xl:text-xl font-bold tabular-nums leading-none" style={{ color }}>
          {value ?? '—'}
        </span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
      {children}
    </p>
  )
}"""
content = content.replace(kpicard_target, "// ─── Shared UI blocks (Extracted) ─────────────────────────────────────────────")

# 5. DiveHeader
diveheader_target = """      {/* ══════════════════════════════════════════════════════════════ HEADER */}
      <header className="h-11 flex-none flex items-center gap-3 px-4
                         bg-card border-b border-border shadow-sm shrink-0 z-10">

        <button onClick={() => navigate(backTo)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground
                     hover:bg-muted transition-colors shrink-0">
          <ArrowLeft size={15} />
        </button>

        <span className={`px-2.5 py-1 rounded text-xs font-semibold shrink-0 ${sCls}`}>
          {sText}
        </span>

        <h1 className="font-bold text-foreground text-[15px] truncate flex-1 min-w-0">
          {dive.title}
        </h1>

        <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          {dive.trip && (
            <Link to={`/trips/${dive.trip._id}`}
              className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Anchor size={11} /> {dive.trip.name}
            </Link>
          )}
          {hasGps && dive.locationName && (
            <span className="flex items-center gap-1.5 max-w-[200px] truncate"
              title={dive.locationName}>
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{dive.locationName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasSensor && (
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold
                             text-emerald-600 dark:text-emerald-400
                             bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-2.5 py-1.5">
              <Radio size={11} className="animate-pulse shrink-0" />
              DATA SYNCED
            </span>
          )}
          {canUpload && (
            <button onClick={() => setShowSensorUp(true)} title="Upload sensor data"
              className="p-2 rounded-lg text-muted-foreground hover:text-primary
                         hover:bg-muted transition-colors">
              <Activity size={15} />
            </button>
          )}
          {canUpload && (
            <button onClick={() => setShowUpload(true)} title="Upload media"
              className="p-2 rounded-lg text-muted-foreground hover:text-primary
                         hover:bg-muted transition-colors">
              <Upload size={15} />
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowForm(true)} title="Edit dive"
              className="p-2 rounded-lg text-muted-foreground hover:text-yellow-500
                         hover:bg-muted transition-colors">
              <Pencil size={15} />
            </button>
          )}
          <div className="relative" ref={exportRef}>
            <button onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                         text-muted-foreground border border-border hover:border-input
                         hover:text-foreground hover:bg-muted transition-colors">
              <Download size={12} /> Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-card border border-border
                              rounded-xl shadow-lg py-1 z-50">
                <button onClick={() => { exportCsv(); setShowExport(false) }}
                  disabled={!chartData.length}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                             hover:bg-muted transition-colors disabled:opacity-40 text-left">
                  <FileText size={13} className="text-muted-foreground shrink-0" />
                  Sensor CSV
                </button>
                <button onClick={() => { exportChartPng(); setShowExport(false) }}
                  disabled={!chartData.length}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                             hover:bg-muted transition-colors disabled:opacity-40 text-left">
                  <Download size={13} className="text-muted-foreground shrink-0" />
                  Chart PNG
                </button>
              </div>
            )}
          </div>
        </div>
      </header>"""
diveheader_replacement = """      {/* ══════════════════════════════════════════════════════════════ HEADER */}
      <DiveHeader 
        dive={dive}
        sText={sText}
        sCls={sCls}
        backTo={backTo}
        navigate={navigate}
        hasSensor={hasSensor}
        canUpload={canUpload}
        canEdit={canEdit}
        setShowSensorUp={setShowSensorUp}
        setShowUpload={setShowUpload}
        setShowForm={setShowForm}
        showExport={showExport}
        setShowExport={setShowExport}
        exportRef={exportRef}
        exportCsv={exportCsv}
        exportChartPng={exportChartPng}
        chartData={chartData}
      />"""
content = content.replace(diveheader_target, diveheader_replacement)

# 6. LocationPanel
locationpanel_target = """          {/* Location / Map */}
          <div className="flex-none lg:flex-1 h-[250px] lg:h-auto lg:min-h-[150px] flex flex-col rounded-xl bg-card border border-border overflow-hidden">
            <SectionLabel>
              <span className="px-3 pt-3 block">Location</span>
            </SectionLabel>
            <div className="flex-1 min-h-0 relative">
              {hasGps ? (
                <DiveMap lat={dive.gpsLocation.lat} lng={dive.gpsLocation.lng} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted">
                  <MapPin size={22} className="text-muted-foreground/40" />
                  <p className="text-[10px] text-muted-foreground">No GPS data</p>
                </div>
              )}
            </div>
            {hasGps && dive.locationName && (
              <div className="shrink-0 px-3 py-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground truncate" title={dive.locationName}>
                  {dive.locationName}
                </p>
              </div>
            )}
          </div>"""
locationpanel_replacement = """          {/* Location / Map */}
          <LocationPanel dive={dive} hasGps={hasGps} />"""
content = content.replace(locationpanel_target, locationpanel_replacement)

# 7. AlertsPanel
alertspanel_target = """          {/* Alerts */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-card border border-border p-3">
            <SectionLabel>Alerts</SectionLabel>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
              {anomalies.length > 0 ? (
                anomalies.map((a, i) => (
                  <div key={i}
                    className="flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg
                               bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-400 dark:border-amber-600">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Warning</p>
                      <p className="text-[10px] text-muted-foreground capitalize truncate">
                        {a.metric} · {typeof a.value === 'number' ? a.value.toFixed(1) : a.value}
                        {a.metric === 'depth' ? ' m' : a.metric === 'temp' ? ' °C' : ' bar'}
                      </p>
                    </div>
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                  </div>
                ))
              ) : hasSensor ? (
                <div className="flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg
                                bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-400 dark:border-emerald-600">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">All Clear</p>
                    <p className="text-[10px] text-muted-foreground">No anomalies detected</p>
                  </div>
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                </div>
              ) : (
                <div className="px-2.5 py-2 rounded-lg bg-muted border border-dashed border-border">
                  <p className="text-[10px] text-muted-foreground">
                    Upload sensor data to detect anomalies
                  </p>
                </div>
              )}
            </div>
          </div>"""
alertspanel_replacement = """          {/* Alerts */}
          <AlertsPanel anomalies={anomalies} hasSensor={hasSensor} />"""
content = content.replace(alertspanel_target, alertspanel_replacement)

# 8. BottomChart
bottomchart_target = """      {/* ═══════════════════════════════════════════════════════════ BOTTOM CHART */}
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

          <button onClick={() => setChartExpanded(v => !v)}
            className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground
                       hover:text-foreground border border-border hover:border-input
                       rounded px-2.5 py-1 transition-colors">
            {chartExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            {chartExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {/* Chart canvas */}
        <div ref={chartContainerRef} className="flex-1 min-h-0 px-2 py-1">
          {chartTab === 'env' ? (
            hasSensor && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 36, left: -12, bottom: 0 }}>
                  <defs>
                    {[['gD','#3b82f6'],['gT','#f59e0b'],['gP','#10b981']].map(([gId, c]) => (
                      <linearGradient key={gId} id={gId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="timestamp" tickFormatter={fmtTime}
                    {...AXIS} interval="preserveStartEnd" />
                  <YAxis {...AXIS} width={28} />
                  <Tooltip content={<ChartTooltip />} />

                  {/* Video sync marker — moves with playback when recordedAt is set */}
                  {syncIdx != null && chartData[syncIdx] && (
                    <ReferenceLine
                      x={chartData[syncIdx].timestamp}
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      label={{ value: '▶', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }}
                    />
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
      </div>"""
bottomchart_replacement = """      {/* ═══════════════════════════════════════════════════════════ BOTTOM CHART */}
      <BottomChart
        chartExpanded={chartExpanded}
        chartTab={chartTab}
        setChartTab={setChartTab}
        hidden={hidden}
        setHidden={setHidden}
        hasNavData={hasNavData}
        hasPowerData={hasPowerData}
        chartData={chartData}
        syncIdx={syncIdx}
        anomalySet={anomalySet}
        isDark={isDark}
        hasSensor={hasSensor}
      />"""
content = content.replace(bottomchart_target, bottomchart_replacement)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
