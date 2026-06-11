import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { KpiCard, pickKpiSize } from '../ui/KpiCard'

const KPIS = [
  { key: 'depth',    label: 'Depth',      unit: 'm',   color: '#0891b2', fmt: v => v.toFixed(2) },
  { key: 'temp',     label: 'Water Temp', unit: '°C',  color: '#f59e0b', fmt: v => v.toFixed(1) },
  { key: 'voltage',  label: 'Voltage',    unit: 'V',   color: '#eab308', fmt: v => v.toFixed(2) },
  { key: 'humidity', label: 'Humidity',   unit: '%',   color: '#10b981', fmt: v => v.toFixed(1) },
]

// CurrentStatus renders 4 KPI cards adaptively:
//   - ResizeObserver measures the content area height each time it changes
//   - pickKpiSize() selects the largest tier that fits all 4 cards without overflow
//   - Vertical flex (sm→2xl): cards use flex-1 to fill all available height — no wasted space
//   - 2x2 grid: fallback when height is very tight
//   - overflow-hidden on content: zero scrollbars
//
// Props:
//   stats          — { depth, temp, voltage, humidity } each { avg, min, max }
//   expanded       — bool, controlled by parent (hides Location panel when true)
//   onToggle       — () => void
export function CurrentStatus({ stats, expanded, onToggle }) {
  const contentRef = useRef(null)
  const [kpiSize, setKpiSize] = useState('md')

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => setKpiSize(pickKpiSize(el.clientHeight))
    const obs = new ResizeObserver(update)
    obs.observe(el)
    update()
    return () => obs.disconnect()
  }, [])

  const cards = KPIS.map(({ key, label, unit, color, fmt }) => {
    const avg = stats?.[key]?.avg
    return { label, unit, color, value: avg != null ? fmt(avg) : '—' }
  })

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

      {/* Content — measured by ResizeObserver, never scrolls */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-hidden p-1.5">
        {kpiSize === '2x2' ? (
          <div className="grid grid-cols-2 gap-1.5 h-full">
            {cards.map(c => <KpiCard key={c.label} size="2x2" {...c} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 h-full">
            {cards.map(c => <KpiCard key={c.label} size={kpiSize} {...c} />)}
          </div>
        )}
      </div>

    </div>
  )
}
