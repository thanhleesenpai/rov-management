import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { 
  File, FileText, CheckCircle2, AlertTriangle, X, Play, Pause, 
  Volume2, VolumeX, Maximize2, Minimize2, Loader, 
  Clock, Info, Sparkles, Trash2, Camera, Clapperboard, Square, Images
} from 'lucide-react'
import api from '@/lib/axios'
import { Skeleton } from '@/components/shared/Skeleton'
import { useAuthStore } from '@/store/auth.store'

// ─── Media helpers ────────────────────────────────────────────────────────────

const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'm4v']
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

export const resolveType = (m) => {
  if (m.type === 'video' || m.type === 'image') return m.type
  const ext = m.originalName?.split('.').pop()?.toLowerCase()
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  return 'other'
}

export function useMediaUrl(id) {
  return useQuery({
    queryKey: ['media-url', id],
    queryFn:  () => api.get(`/media/${id}/url`).then(r => r.data.url),
    staleTime: 50 * 60 * 1000,
    enabled: !!id,
  })
}

// ─── Playlist thumbnail ───────────────────────────────────────────────────────

export function ThumbVertical({ media, active, onClick, label, canEdit, onDelete, deleting }) {
  const { data: url } = useMediaUrl(media._id)
  const type = resolveType(media)
  const isClip = label?.includes('clip') || media.type === 'clip'

  return (
    <div className="relative group/thumb rounded-lg overflow-hidden border-2 border-white/20
                    bg-slate-800 cursor-pointer hover:border-white/40 transition-colors"
         onClick={onClick}>
      {type === 'image' && url
        ? <img src={url} alt="" className="w-full h-full object-cover aspect-video" />
        : type === 'video' && url
          ? <video src={url} muted className="w-full h-full object-cover aspect-video"
              onLoadedMetadata={e => { e.target.currentTime = 1 }} />
          : <div className="w-full h-full bg-slate-700 flex items-center justify-center aspect-video">
              <FileText size={12} className="text-slate-400" />
            </div>}

      {/* Type badge — top-left (like EvidenceCard) */}
      <div className="absolute top-1 left-1 text-[7px] font-bold uppercase tracking-wider
                      px-1.5 py-0.5 rounded leading-none text-white bg-black/40">
        {type === 'image' ? 'photo' : 'video'}
      </div>

      {/* Time label — bottom (like EvidenceCard) with background */}
      <div className="absolute bottom-1 left-0 right-0 text-center text-[7px] text-white/80
                      font-mono px-1 bg-black/60 py-0.5">
        {label}
      </div>

      {/* Delete button — top-right corner, ghost button, like Evidence list */}
      {canEdit && (
        <button onClick={e => { e.stopPropagation(); onDelete && onDelete() }}
          disabled={deleting}
          className="absolute -top-1 -right-1 p-1 rounded-full
                     opacity-0 group-hover/thumb:opacity-100 transition-opacity
                     bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 z-20">
          {deleting ? <Loader size={10} className="animate-spin" /> : <X size={10} />}
        </button>
      )}
    </div>
  )
}


// ─── Inline recordedAt editor (in playlist) ───────────────────────────────────

export function RecordedAtEditor({ media, diveId, onCancel, onDone }) {
  const queryClient = useQueryClient()
  const toLocal = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    const pad = n => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  }
  const [val, setVal] = useState(() => toLocal(media.recordedAt))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch(`/media/${media._id}`, {
        recordedAt: val ? new Date(val).toISOString() : null,
      })
      queryClient.invalidateQueries({ queryKey: ['media', diveId] })
      if (onDone) onDone()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="px-1 pb-1">
      <p className="text-[9px] text-white/40 mb-0.5 uppercase tracking-wider">Sync start time</p>
      <div className="flex flex-col gap-1.5">
        <input
          type="datetime-local"
          step="1"
          value={val}
          onChange={e => setVal(e.target.value)}
          style={{ colorScheme: 'dark' }}
          className="w-full text-[10px] px-1.5 py-1 rounded border border-white/20
                     bg-white/5 text-white/70 focus:outline-none focus:border-blue-400" />
        <div className="flex gap-1 mt-0.5">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 px-2 py-1.5 text-[11px] rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-2 py-1.5 text-[11px] rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors">
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Custom video controls (replaces native controls for unified hover UX) ────

export function RetryAnalysisButton({ mediaId, diveId, queryClient }) {
  const [loading, setLoading] = useState(false)
  const handleRetry = async () => {
    setLoading(true)
    try {
      await api.post(`/media/${mediaId}/analyze`, { model: 'yolov8n', confidence: 0.3 })
      await queryClient.invalidateQueries({ queryKey: ['media', diveId] })
    } catch {
      setLoading(false)
    }
  }
  return (
    <div className="absolute bottom-2 group-hover:bottom-14 right-3 z-50
                    transition-[bottom] duration-200 ease-out">
      <button onClick={handleRetry} disabled={loading}
        title="Analysis failed — click to retry"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                   bg-red-900/80 backdrop-blur-sm border border-red-500/40
                   text-red-300 text-[9px] font-semibold
                   hover:bg-red-800/80 disabled:opacity-50 transition-colors pointer-events-auto">
        {loading
          ? <><Loader size={9} className="animate-spin" /> Queuing…</>
          : <><AlertTriangle size={9} /> Analysis failed · Retry</>}
      </button>
    </div>
  )
}

// ─── AI Analyze Popover ───────────────────────────────────────────────────────

const MODEL_META = {
  yolov8n:          { desc: 'COCO 80 classes · Fast' },
  fish1:            { desc: 'Fish species · Nano' },
  fish2:            { desc: 'Fish species · Nano' },
  trash:            { desc: 'Debris classes · Nano' },
  f4k_single_m:     { desc: 'f4k dataset · Medium' },
  deepfish_multi_m: { desc: 'DeepFish dataset · Medium' },
}

function relTime(date) {
  if (!date) return ''
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function AIAnalyzePopover({ media, diveId, canUse, portalTarget }) {
  const queryClient  = useQueryClient()
  const [open,       setOpen]       = useState(false)
  const [selModel,   setSelModel]   = useState('yolov8n')
  const [conf,       setConf]       = useState(0.30)
  const [running,    setRunning]    = useState(false)
  const [pos,        setPos]        = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const popRef = useRef(null)

  const { data: models = [{ name: 'yolov8n', label: 'YOLOv8n General', speed: 'fast', warning: null }] } = useQuery({
    queryKey: ['yolo-models'],
    queryFn:  () => api.get('/media/models').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: canUse,
  })

  const reposition = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const target = portalTarget
    if (target && target !== document.body) {
      // Fullscreen: compute coords relative to the container element
      const cr = target.getBoundingClientRect()
      setPos({
        top:  r.bottom - cr.top + 6,
        left: Math.min(r.right - cr.left - 260, cr.width - 272),
      })
    } else {
      setPos({
        top:  r.bottom + 6,
        left: Math.min(r.right - 260, window.innerWidth - 272),
      })
    }
  }, [portalTarget])

  const toggle = () => {
    if (!open) reposition()
    setOpen(v => !v)
  }

  // Close on outside click; reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return
    const onOutside = (e) => {
      if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target))
        setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition])

  const run = async () => {
    if (!media?._id || running) return
    setRunning(true)
    try {
      await api.post(`/media/${media._id}/analyze`, { model: selModel, confidence: conf })
      queryClient.invalidateQueries({ queryKey: ['media', diveId] })
      setOpen(false)
    } catch {}
    setRunning(false)
  }

  if (!canUse || !media) return null

  const isPending   = media.analysisStatus === 'pending'
  const statusColor = { done: 'text-emerald-400', failed: 'text-red-400', pending: 'text-blue-400' }

  return (
    <>
      {/* Trigger button — unified with Detect styling */}
      <button ref={btnRef} onClick={toggle}
        title="AI Analysis settings"
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[10px] font-bold transition-colors select-none ${
          open
            ? 'bg-blue-500/90 text-white'
            : isPending
              ? 'bg-blue-500/60 text-white animate-pulse'
              : 'text-white/80 hover:text-white'
        }`}>
        <Sparkles size={10} />
        <span className="hidden sm:inline">{isPending ? 'Analyzing' : 'Analyze'}</span>
      </button>

      {open && createPortal(
        <div ref={popRef}
          style={{ top: pos.top, left: pos.left }}
          className={`z-[9999] w-64 rounded-xl shadow-2xl overflow-hidden
                     bg-[#0d1117]/96 backdrop-blur-xl border border-white/12 text-white
                     ${portalTarget && portalTarget !== document.body ? 'absolute' : 'fixed'}`}>

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <Sparkles size={13} className="text-violet-400 shrink-0" />
            <span className="text-sm font-semibold">AI Analysis</span>
            {media.analysisStatus && (
              <span className={`ml-auto text-[10px] font-medium capitalize
                               ${statusColor[media.analysisStatus] ?? 'text-white/40'}`}>
                {media.analysisStatus}
                {media.updatedAt ? ` · ${relTime(media.updatedAt)}` : ''}
              </span>
            )}         
          </div>

          {/* Model selector */}
          <div className="px-4 pt-2 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">Model</p>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {models.map(mod => {
                const name       = typeof mod === 'string' ? mod : mod.name
                const label      = mod.label ?? name
                const desc       = MODEL_META[name]?.desc ?? (mod.speed === 'slow' ? 'Heavier model' : 'Fast inference')
                const warning    = mod.warning ?? null
                const isSelected = selModel === name
                return (
                  <button key={name} onClick={() => setSelModel(name)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg
                                text-left transition-colors
                                ${isSelected
                                  ? 'bg-violet-500/20 border border-violet-400/30'
                                  : 'border border-transparent hover:bg-white/6'}`}>
                    <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center
                                     ${isSelected ? 'border-violet-400' : 'border-white/30'}`}>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 block" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium leading-none text-white">{label}</span>
                      <span className="block text-[10px] text-white/60 mt-0.5">{desc}</span>
                      {warning && (
                        <span className="block text-[10px] text-amber-300 mt-0.5">⚠ {warning}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Confidence slider */}
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Confidence</p>
              <span className="text-sm font-bold tabular-nums text-violet-300">{conf.toFixed(2)}</span>
            </div>
            <input type="range" min={0.10} max={0.90} step={0.05}
              value={conf} onChange={e => setConf(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-violet-400" />
            <div className="flex justify-between text-[9px] text-white/25 mt-1 px-0.5">
              <span>0.10 · Nhạy</span>
              <span>0.90 · Chặt</span>
            </div>
          </div>

          {/* Run button */}
          <div className="px-4 pb-4">
            <button onClick={run} disabled={running || isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                         font-semibold text-sm transition-colors
                         bg-violet-600 hover:bg-violet-500
                         disabled:opacity-50 disabled:cursor-not-allowed">
              {running || isPending
                ? <><Loader size={13} className="animate-spin" /> Running…</>
                : <><Sparkles size={13} /> Run Analysis</>}
            </button>
          </div>
        </div>,
        portalTarget || document.body
      )}
    </>
  )
}

// currentTime + duration are lifted to parent so they stay valid even while video URL is loading
export function CustomVideoControls({ videoRef, isPlaying, mediaId, containerRef, currentTime, duration, isFullscreen, popupOpen, showToolbar }) {
  const [muted,      setMuted]      = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragPct,    setDragPct]    = useState(0)
  const progressRef = useRef(null)

  // Only manage muted state locally — time/duration come from parent via props
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onVol = () => setMuted(v.muted)
    v.addEventListener('volumechange', onVol)
    setMuted(v.muted)
    return () => v.removeEventListener('volumechange', onVol)
  }, [mediaId])

  const fmt = (s) => {
    if (s === null || s === undefined || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  // During drag: use cursor-derived pct (instant, no async React cycle).
  // After drag: use actual video currentTime from parent prop.
  const videoPct  = duration > 0 ? (currentTime / duration) * 100 : 0
  const displayPct = isDragging ? dragPct : videoPct

  const calcPct = (clientX) => {
    if (!progressRef.current) return 0
    const r = progressRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))
  }
  const applySeek = (clientX) => {
    const v = videoRef.current; if (!v) return
    const p = calcPct(clientX)
    setDragPct(p)
    v.currentTime = (p / 100) * v.duration
  }

  const togglePlay = (e) => {
    e.stopPropagation()
    const v = videoRef.current; if (!v) return
    isPlaying ? v.pause() : v.play().catch(() => {})
  }
  const handleProgressMouseDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    setIsDragging(true)
    applySeek(e.clientX)
    const onMove = (ev) => applySeek(ev.clientX)
    const onUp   = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }
  const toggleMute = (e) => {
    e.stopPropagation()
    const v = videoRef.current; if (!v) return
    v.muted = !v.muted
  }
  const handleFullscreen = (e) => {
    e.stopPropagation()
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef?.current?.requestFullscreen().catch(() => {})
  }

  return (
    <div className={`absolute bottom-0 left-0 right-0 z-30
                    transition-opacity duration-200
                    px-3 pt-8 pb-2
                    bg-gradient-to-t from-black/75 via-black/30 to-transparent
                    ${popupOpen || showToolbar
                      ? 'opacity-100 pointer-events-auto'
                      : 'opacity-0 pointer-events-none'}`}>
      {/* Progress bar */}
      <div ref={progressRef} onMouseDown={handleProgressMouseDown}
        className={`mb-2.5 transition-all bg-white/30 rounded-full cursor-pointer relative group/prog
                    ${isDragging ? 'h-1.5' : 'h-1 hover:h-1.5'}`}>
        <div className="h-full bg-white rounded-full pointer-events-none" style={{ width: `${displayPct}%` }} />
        <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white
                        pointer-events-none transition-opacity
                        ${isDragging ? 'opacity-100' : 'opacity-0 group-hover/prog:opacity-100'}`}
          style={{ left: `${displayPct}%` }} />
      </div>
      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors p-0.5">
          {isPlaying ? <Pause size={16} fill="white" strokeWidth={0} /> : <Play size={16} fill="white" strokeWidth={0} />}
        </button>
        <span className="text-white/75 text-[11px] tabular-nums select-none">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <div className="flex-1" />
        <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors p-0.5">
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <button onClick={handleFullscreen} className="text-white hover:text-white/80 transition-colors p-0.5">
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  )
}


// ─── Main media renderer ──────────────────────────────────────────────────────

export function DetectionSVG({ labels, dims }) {
  if (!dims || !labels?.some(l => l.bbox)) return null
  return (
    <svg viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none z-10">
      {labels.filter(l => l.bbox).map((l, i) => {
        const { x1, y1, x2, y2 } = l.bbox
        const px1 = x1 * dims.w, py1 = y1 * dims.h
        const pw  = (x2 - x1) * dims.w, ph = (y2 - y1) * dims.h
        const color = l.confidence > 0.8 ? '#60a5fa' : '#fbbf24'
        const sw = Math.max(dims.w * 0.003, 2)
        const fs = Math.max(dims.h * 0.028, 12)
        const lh = fs * 1.6
        const labelW = (l.name.length * fs * 0.62) + (String(Math.round(l.confidence * 100)).length * fs * 0.62) + fs * 1.2
        return (
          <g key={`${l.name}-${i}`}>
            <rect x={px1} y={py1} width={pw} height={ph}
              fill="none" stroke={color} strokeWidth={sw} />
            <rect x={px1} y={Math.max(0, py1 - lh)} width={Math.min(labelW, pw + sw)}
              height={lh} fill={color} rx={3} opacity={0.9} />
            <text x={px1 + 4} y={Math.max(lh * 0.78, py1 - lh * 0.22)}
              fontSize={fs} fill="black" fontFamily="system-ui,sans-serif" fontWeight="700">
              {l.name} {Math.round(l.confidence * 100)}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function MainMedia({ media, videoRef, containerRef, activeLabs, onEnded, onTimeUpdate, onPlay, onPause, onLoadedMetadata, showDetections }) {
  const { data: url, isLoading } = useMediaUrl(media?._id)
  const [dims, setDims] = useState(null)
  const type = media ? resolveType(media) : null

  useEffect(() => { setDims(null) }, [media?._id])

  if (!media) return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
      <File size={36} className="text-slate-600" />
      <p className="text-sm text-slate-500">No media uploaded yet</p>
    </div>
  )
  if (isLoading) return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
  if (type === 'video') return (
    <div className="relative w-full h-full cursor-pointer"
      onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play().catch(()=>{}) : v.pause() }}>
      <video key={url} ref={videoRef} src={url}
        className="w-full h-full object-contain"
        onClick={e => { e.stopPropagation(); const v = e.currentTarget; v.paused ? v.play().catch(()=>{}) : v.pause() }}
        onDoubleClick={e => { e.stopPropagation(); document.fullscreenElement ? document.exitFullscreen() : containerRef?.current?.requestFullscreen().catch(()=>{}) }}
        onEnded={onEnded} onTimeUpdate={onTimeUpdate}
        onPlay={onPlay} onPause={onPause}
        onLoadedMetadata={e => {
          setDims({ w: e.target.videoWidth, h: e.target.videoHeight })
          onLoadedMetadata?.(e)
        }} />
      {showDetections && <DetectionSVG labels={activeLabs} dims={dims} />}
    </div>
  )
  if (type === 'image') return (
    <div className="relative w-full h-full">
      <img src={url} alt={media.originalName} className="w-full h-full object-contain"
        onLoad={e => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
      {showDetections && <DetectionSVG labels={activeLabs} dims={dims} />}
    </div>
  )
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
      <FileText size={32} className="text-slate-400" />
      <p className="text-xs text-slate-400">{media.originalName}</p>
      {url && (
        <a href={url} target="_blank" rel="noreferrer"
          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg
                     hover:bg-blue-700 transition-colors">
          Open file
        </a>
      )}
    </div>
  )
}





export function fmtVideoTime(s) {
  if (isNaN(s)) return '00:00';
  const m = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  return `${m.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')}`;
}
