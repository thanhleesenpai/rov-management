import React from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { SectionLabel } from '../ui/SectionLabel'

export function AlertsPanel({ anomalies, hasSensor }) {
  return (
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
    </div>
  )
}
