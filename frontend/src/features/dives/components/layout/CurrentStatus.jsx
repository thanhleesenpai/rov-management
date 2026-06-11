import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { KpiCard, pickKpiSize } from '../ui/KpiCard'

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

function buildCards(defs, stats) {
  return defs.map(({ key, label, unit, color, fmt }) => {
    const avg = stats?.[key]?.avg
    return { label, unit, color, value: avg != null ? fmt(avg) : '—' }
  })
}

// ─── Component ───────────────────────────────────────────────────────────────
//
// Layout rules (all via ResizeObserver, zero scrollbars):
//
//   Collapsed (4 primary KPIs):
//     containerH ≥ 160 → flex-col, cards use flex-1 min-h-0, size = pickKpiSize(H)
//     containerH < 160 → 2×2 compact grid
//
//   Expanded (8 KPIs, Location panel hidden → tall column):
//     Always flex-col — no grid. Cards use flex-1 min-h-0.
//     Size = pickKpiSize(H / 2)  because 8 cards share the same height 4 would.

export function CurrentStatus({ stats, expanded, onToggle }) {
  const contentRef = useRef(null)
  const [containerH, setContainerH] = useState(0)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setContainerH(el.clientHeight))
    obs.observe(el)
    setContainerH(el.clientHeight)
    return () => obs.disconnect()
  }, [])

  const primary  = buildCards(PRIMARY,   stats)
  const all8     = [...primary, ...buildCards(SECONDARY, stats)]

  // Size for collapsed (4 cards): use full height
  const collapsedSize = pickKpiSize(containerH)
  // Size for expanded (8 cards): each card gets ~half the space
  const expandedSize  = pickKpiSize(Math.floor(containerH / 2))

  const cards     = expanded ? all8 : primary
  const kpiSize   = expanded ? expandedSize : collapsedSize
  const use2x2    = !expanded && collapsedSize === '2x2'

  return (
    <div className="flex-1 min-h-0 rounded-xl bg-card border border-border flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Current Status
        </span>
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-hidden p-1.5">

        {/* Collapsed tight: 2×2 compact grid */}
        {use2x2 && (
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 h-full">
            {primary.map(c => <KpiCard key={c.label} size="2x2" {...c} />)}
          </div>
        )}

        {/* Collapsed or Expanded: vertical flex-col — cards share height equally */}
        {!use2x2 && (
          <div className="flex flex-col gap-1.5 h-full">
            {cards.map(c => (
              <div key={c.label} className="flex-1 min-h-0">
                <KpiCard size={kpiSize} {...c} />
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
