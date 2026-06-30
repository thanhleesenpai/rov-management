import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { KpiCard } from '../ui/KpiCard'

const PRIMARY = [
  { key: 'depth',    label: 'Depth',      unit: 'm',   color: '#0891b2', fmt: v => v.toFixed(2) },
  { key: 'temp',     label: 'Water Temp', unit: '°C',  color: '#f59e0b', fmt: v => v.toFixed(1) },
  { key: 'voltage',  label: 'Voltage',    unit: 'V',   color: '#eab308', fmt: v => v.toFixed(2) },
  { key: 'humidity', label: 'Humidity',   unit: '%',   color: '#10b981', fmt: v => v.toFixed(1) },
]

const SECONDARY = [
  { key: 'temperature', label: 'Board Temp',  unit: '°C', color: '#f43f5e', fmt: v => v.toFixed(1) },
  { key: 'powerLevel',  label: 'Power Level', unit: '%',  color: '#a855f7', fmt: v => v.toFixed(0) },
  { key: 'lightLevel',  label: 'Light Level', unit: '%',  color: '#facc15', fmt: v => v.toFixed(0) },
  { key: 'cameraTilt',  label: 'Cam Tilt',    unit: '°',  color: '#64748b', fmt: v => v.toFixed(1) },
]

function buildCards(defs, stats, reading) {
  return defs.map(({ key, label, unit, color, fmt }) => {
    const live = reading?.[key]
    const avg  = stats?.[key]?.avg
    const raw  = live != null ? live : avg
    return { label, unit, color, value: raw != null ? fmt(raw) : '—' }
  })
}

function pickSize(rowH) {
  if (rowH >= 65) return 'lg'
  if (rowH >= 48) return 'md'
  if (rowH >= 34) return 'sm'
  return '2x2'
}

// contentH thresholds for auto-layout
const AUTO_8_MIN  = 250   // >= 250px → auto-show 8 in 1 col
const COMPACT_MIN = 120   // < 120px  → 2×2 compact (whatever N)

export function CurrentStatus({ stats, currentReading, expanded, onToggle }) {
  const contentRef = useRef(null)
  const [contentH, setContentH] = useState(200)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setContentH(el.clientHeight))
    obs.observe(el)
    setContentH(el.clientHeight)
    return () => obs.disconnect()
  }, [])

  const isLive    = currentReading != null
  const autoAll   = contentH >= AUTO_8_MIN
  const showAll   = expanded || autoAll          // 8 cards

  const primary = buildCards(PRIMARY,   stats, currentReading)
  const all8    = [...primary, ...buildCards(SECONDARY, stats, currentReading)]
  const cards   = showAll ? all8 : primary
  const N       = cards.length   // 4 or 8

  // Compact mode: height too small for single column → switch to 2 cols
  const rowH1col  = (contentH - (N - 1) * 6) / N
  const size      = pickSize(rowH1col)
  const compact   = contentH < COMPACT_MIN || size === '2x2'
  const cols      = compact ? 2 : 1
  const rows      = compact ? Math.ceil(N / 2) : N

  return (
    <div className="h-full rounded-xl bg-card border border-border flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Current Status
        </span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="text-[8px] font-bold tracking-widest text-blue-400 uppercase">live</span>
          )}
          {expanded && onToggle && (
            <button onClick={onToggle}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Collapse">
              <ChevronDown size={13} />
            </button>
          )}
          {!expanded && !autoAll && onToggle && (
            <button onClick={onToggle}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Expand all">
              <ChevronUp size={13} />
            </button>
          )}
        </div>
      </div>
      <div ref={contentRef} className="flex-1 min-h-0 p-1.5">
        <div
          className="h-full grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows:    `repeat(${rows}, 1fr)`,
          }}
        >
          {cards.map(c => <KpiCard key={c.label} size={size} {...c} />)}
        </div>
      </div>
    </div>
  )
}
