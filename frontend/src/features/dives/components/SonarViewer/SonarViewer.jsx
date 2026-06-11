import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import api from '@/lib/axios'
import { SonarCanvas } from './SonarCanvas'
import { useSonarParser } from './useSonarParser'
import { useSonarPlayer } from './useSonarPlayer'

const COLOR_OPTS = [
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'green',   label: 'Green'   },
  { value: 'white',   label: 'White'   },
  { value: 'yellow',  label: 'Yellow'  },
]
const RANGE_OPTS = [
  { value: 0.25, label: '25%' },
  { value: 0.5,  label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1.0,  label: '100%'},
]

// syncTime: current video time in seconds (driven by video element).
// When provided the sonar canvas follows the video — no manual controls.
export default function SonarViewer({ diveId, syncTime }) {
  const [selFileId, setSelFileId] = useState(null)
  const [colorMode, setColorMode] = useState('heatmap')
  const [maxRange,  setMaxRange]  = useState(1.0)
  const canvasRef = useRef(null)

  const isSynced = syncTime != null

  // ── File list ──────────────────────────────────────────────────────────────
  const { data: files = [] } = useQuery({
    queryKey: ['sonar-list', diveId],
    queryFn:  () => api.get(`/dives/${diveId}/sonar`).then(r => r.data.data ?? r.data),
    staleTime: 60_000,
    enabled:   !!diveId,
  })

  useEffect(() => {
    if (files.length > 0 && !selFileId) setSelFileId(files[0]._id)
  }, [files, selFileId])

  const selFile = files.find(f => f._id === selFileId) ?? null

  // ── Presigned URL ─────────────────────────────────────────────────────────
  const { data: sonarUrl } = useQuery({
    queryKey: ['sonar-url', selFileId],
    queryFn:  () => api.get(`/dives/${diveId}/sonar/${selFileId}/url`).then(r => r.data.url),
    enabled:   !!selFileId,
    staleTime:  700_000,
    gcTime:     800_000,
  })

  // ── Parse ─────────────────────────────────────────────────────────────────
  const { frames, loading, error, progress } = useSonarParser(sonarUrl)

  // ── Player ────────────────────────────────────────────────────────────────
  const { syncToTime } = useSonarPlayer({ frames, canvasRef, colorMode, maxRange })

  // Slave to video: whenever syncTime changes seek the canvas
  useEffect(() => {
    if (!isSynced || !frames?.length) return
    syncToTime(syncTime * 1000)
  }, [syncTime, isSynced, !!frames?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empty state ────────────────────────────────────────────────────────────
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-6">
        <Radio size={18} className="text-muted-foreground/35" />
        <p className="text-[10px] text-muted-foreground">No sonar data</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5 p-2">

      {/* ── File selector ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        {files.length > 1 ? (
          <select
            value={selFileId ?? ''}
            onChange={e => setSelFileId(e.target.value)}
            className="flex-1 min-w-0 text-[9px] bg-muted border border-border rounded
                       px-2 py-1 text-foreground truncate">
            {files.map(f => <option key={f._id} value={f._id}>{f.filename}</option>)}
          </select>
        ) : (
          <span className="flex-1 min-w-0 text-[9px] text-muted-foreground truncate"
            title={selFile?.filename}>
            {selFile?.filename}
          </span>
        )}
        {/* Sync badge */}
        {isSynced && frames?.length > 0 && (
          <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded
                           bg-blue-500/20 text-blue-400 text-[8px] font-bold tracking-wide">
            <Radio size={7} /> SYNC
          </span>
        )}
      </div>

      {/* ── Canvas — square aspect via aspect-square container ───────────── */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black rounded-lg relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/85">
            <div className="w-20 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-150"
                style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[9px] text-blue-400 font-mono">{progress}%</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <p className="text-[9px] text-red-400 text-center">{error}</p>
          </div>
        )}
        <SonarCanvas ref={canvasRef} />
      </div>

      {/* ── Display settings ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-end gap-1">
        <select value={colorMode} onChange={e => setColorMode(e.target.value)}
          className="text-[8px] bg-muted border border-border rounded px-1.5 py-0.5
                     text-foreground leading-none">
          {COLOR_OPTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={maxRange} onChange={e => setMaxRange(Number(e.target.value))}
          className="text-[8px] bg-muted border border-border rounded px-1.5 py-0.5
                     text-foreground leading-none">
          {RANGE_OPTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
    </div>
  )
}
