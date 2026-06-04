import React from 'react'

export function KpiCard({ label, value, unit, color }) {
  return (
    <div className="bg-card border border-border rounded-lg px-2.5 py-2 lg:px-3 lg:py-1.5 2xl:px-4 2xl:py-3 flex flex-col lg:flex-row 2xl:flex-col items-start lg:items-center 2xl:items-start justify-between">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5 lg:mb-0 2xl:mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-lg lg:text-base 2xl:text-xl font-bold font-mono tabular-nums leading-none" style={{ color }}>
          {value ?? '—'}
        </span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}
