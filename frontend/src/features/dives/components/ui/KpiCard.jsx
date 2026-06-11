import React from 'react'

// Height thresholds (px) for the content area holding 4 stacked KPI cards.
// ResizeObserver measures the container, then pickKpiSize selects the largest tier that fits.
const SIZE_THRESHOLDS = [
  { size: '2xl', min: 310 },
  { size: 'xl',  min: 265 },
  { size: 'lg',  min: 225 },
  { size: 'md',  min: 190 },
  { size: 'sm',  min: 160 },
]
// Below 160px → '2x2' (2-column grid, each card half-width)

export function pickKpiSize(availableH) {
  for (const { size, min } of SIZE_THRESHOLDS) {
    if (availableH >= min) return size
  }
  return '2x2'
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function KpiCard({ label, value, unit, color, size = 'lg' }) {
  if (size === '2x2') {
    return (
      <div className="bg-muted/40 rounded-lg p-2 flex flex-col justify-center overflow-hidden">
        <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground truncate leading-none mb-0.5">
          {label}
        </p>
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="text-xs font-bold font-mono tabular-nums leading-none truncate" style={{ color }}>
            {value ?? '—'}
          </span>
          {unit && <span className="text-[8px] text-muted-foreground shrink-0">{unit}</span>}
        </div>
      </div>
    )
  }

  const styles = {
    sm:    { card: 'px-2 py-1.5 rounded-lg',    lbl: 'text-[8px] mb-0.5',  val: 'text-xs'   },
    md:    { card: 'px-2.5 py-2 rounded-lg',    lbl: 'text-[9px] mb-1',    val: 'text-sm'   },
    lg:    { card: 'px-3 py-2 rounded-xl',       lbl: 'text-[9px] mb-1',    val: 'text-base' },
    xl:    { card: 'px-3 py-2.5 rounded-xl',     lbl: 'text-[10px] mb-1.5', val: 'text-lg'   },
    '2xl': { card: 'px-4 py-3 rounded-xl',       lbl: 'text-[10px] mb-1.5', val: 'text-xl'   },
  }
  const s = styles[size] ?? styles.lg

  return (
    // flex-1 min-h-0: card stretches inside parent flex-col to fill all available height
    <div className={`flex-1 min-h-0 bg-muted/40 ${s.card} flex flex-col justify-center overflow-hidden`}>
      <p className={`${s.lbl} font-bold uppercase tracking-widest text-muted-foreground leading-none`}>
        {label}
      </p>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`${s.val} font-bold font-mono tabular-nums leading-none`} style={{ color }}>
          {value ?? '—'}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}
