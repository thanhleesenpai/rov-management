import React from 'react'

// ─── Sizing ───────────────────────────────────────────────────────────────────
//
// Use pickKpiSize(containerHeightPx, cardCount) to choose the largest tier that
// fits without overflow. The ResizeObserver in CurrentStatus calls this on every
// container resize so cards always fill the available space.
//
// Tiers (cardCount = 4, 1 column):
//   2xl ≥ 310  xl ≥ 265  lg ≥ 225  md ≥ 190  sm ≥ 160  else → '2x2'

const THRESHOLDS_4 = [
  { size: '2xl', min: 310 },
  { size: 'xl',  min: 265 },
  { size: 'lg',  min: 225 },
  { size: 'md',  min: 190 },
  { size: 'sm',  min: 160 },
]

// Expanded: 8 cards in 2 cols / 4 rows — same row count as vertical 4-card stack
// so same thresholds apply.
export function pickKpiSize(availableH) {
  for (const { size, min } of THRESHOLDS_4) {
    if (availableH >= min) return size
  }
  return '2x2'
}

// ─── Card ─────────────────────────────────────────────────────────────────────
// Renders with h-full so it fills its parent (flex wrapper or grid cell).
// Light mode: bg-background border for clear contrast on a bg-card column.

export function KpiCard({ label, value, unit, color, size = 'lg' }) {
  const isCompact = size === '2x2'

  const styles = {
    '2x2': { card: 'p-2 rounded-lg',           lbl: 'text-[8px] mb-0.5',  val: 'text-xs'   },
    sm:    { card: 'px-2 py-1.5 rounded-lg',    lbl: 'text-[8px] mb-0.5',  val: 'text-xs'   },
    md:    { card: 'px-2.5 py-2 rounded-lg',    lbl: 'text-[9px] mb-1',    val: 'text-sm'   },
    lg:    { card: 'px-3 py-2 rounded-xl',       lbl: 'text-[9px] mb-1',    val: 'text-base' },
    xl:    { card: 'px-3 py-2.5 rounded-xl',     lbl: 'text-[10px] mb-1.5', val: 'text-lg'   },
    '2xl': { card: 'px-4 py-3 rounded-xl',       lbl: 'text-[10px] mb-1.5', val: 'text-xl'   },
  }
  const s = styles[size] ?? styles.lg

  return (
    // h-full: fills grid cell or flex wrapper.
    // bg-background border border-border: visible in both light + dark mode.
    <div className={`h-full bg-background border border-border shadow-sm ${s.card} flex flex-col justify-center overflow-hidden`}>
      <p className={`${s.lbl} font-bold uppercase tracking-widest text-muted-foreground leading-none ${isCompact ? 'truncate' : ''}`}>
        {label}
      </p>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`${s.val} font-bold font-mono tabular-nums leading-none ${isCompact ? 'truncate' : ''}`} style={{ color }}>
          {value ?? '—'}
        </span>
        {unit && <span className="text-[9px] text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  )
}
