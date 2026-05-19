import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeStore } from '@/store/theme.store'
import {
  ArrowLeft, MapPin, Anchor, Activity, Upload, Pencil,
  AlertTriangle, File, FileText, CheckCircle2,
  Maximize2, Minimize2, Download, Radio, Sparkles, Film, Loader, Eye, EyeOff,
  Play, Pause, Volume2, VolumeX,
  Camera, Clapperboard, Square, Images, X,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Brush,
} from 'recharts'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import DiveForm from './components/DiveForm'
import ArtificialHorizon from './components/ArtificialHorizon'
import CompassRose from './components/CompassRose'
import MediaUpload from '@/features/media/MediaUpload'
import SensorUpload from '@/features/trips/components/SensorUpload'
import { Skeleton } from '@/components/shared/Skeleton'
import 'leaflet/dist/leaflet.css'

// ─── Status ──────────────────────────────────────────────────────────────────

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-muted text-muted-foreground' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  done:    { text: 'Done',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
}

// ─── Media helpers ────────────────────────────────────────────────────────────

const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'm4v']
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

const resolveType = (m) => {
  if (m.type === 'video' || m.type === 'image') return m.type
  const ext = m.originalName?.split('.').pop()?.toLowerCase()
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  return 'other'
}

function useMediaUrl(id) {
  return useQuery({
    queryKey: ['media-url', id],
    queryFn:  () => api.get(`/media/${id}/url`).then(r => r.data.url),
    staleTime: 50 * 60 * 1000,
    enabled: !!id,
  })
}

// ─── Sensor metrics ───────────────────────────────────────────────────────────

const ENV_METRICS = [
  { key: 'depth',    label: 'Depth',    unit: 'm',   color: '#3b82f6' },
  { key: 'temp',     label: 'Temp',     unit: '°C',  color: '#f59e0b' },
  { key: 'pressure', label: 'Pressure', unit: 'bar', color: '#10b981' },
]

const NAV_METRICS = [
  { key: 'yaw',   label: 'Yaw',   color: '#8b5cf6' },
  { key: 'pitch', label: 'Pitch', color: '#06b6d4' },
  { key: 'roll',  label: 'Roll',  color: '#f97316' },
]

const POWER_METRICS = [
  { key: 'battery_percent', label: 'Battery', unit: '%', color: '#3b82f6', axis: 'left'  },
  { key: 'humidity',        label: 'Humidity', unit: '%', color: '#10b981', axis: 'left'  },
  { key: 'voltage',         label: 'Voltage',  unit: 'V', color: '#f59e0b', axis: 'right' },
]

const MOCK_YPR = Array.from({ length: 24 }, (_, i) => ({
  t:     `+${i * 5}m`,
  yaw:   +(Math.sin(i * 0.42) * 40 + 120).toFixed(1),
  pitch: +(Math.cos(i * 0.71) * 5).toFixed(1),
  roll:  +(Math.sin(i * 1.15 + 0.8) * 9).toFixed(1),
}))

function fmtTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const AXIS = { tick: { fontSize: 9, fill: '#9ca3af' }, axisLine: false, tickLine: false }

// ─── Leaflet map ──────────────────────────────────────────────────────────────

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
}

// ─── Playlist thumbnail ───────────────────────────────────────────────────────

function ThumbVertical({ media, active, onClick, label }) {
  const { data: url } = useMediaUrl(media._id)
  const type = resolveType(media)

  return (
    <button onClick={onClick}
      className={`w-full aspect-video rounded-lg overflow-hidden border-2 transition-all relative block shrink-0
                  ${active
                    ? 'border-blue-500 opacity-100'
                    : 'border-white/10 opacity-50 hover:opacity-80 hover:border-white/30'
                  }`}>
      {type === 'image' && url
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : type === 'video' && url
          ? <video src={url} muted className="w-full h-full object-cover"
              onLoadedMetadata={e => { e.target.currentTime = 1 }} />
          : <div className="w-full h-full bg-slate-700 flex items-center justify-center">
              <FileText size={12} className="text-slate-400" />
            </div>}
      <span className="absolute bottom-0 inset-x-0 text-[8px] text-white/90
                       bg-black/60 py-0.5 px-1 text-center truncate leading-tight">
        {label}
      </span>
      {media.recordedAt && type === 'video' ? (
        <span className="absolute top-1 left-1 flex items-center gap-0.5
                         bg-emerald-500/90 backdrop-blur-sm text-white
                         text-[7px] font-bold px-1 py-0.5 rounded leading-none">
          SYNCED · {fmtTime(media.recordedAt)}
        </span>
      ) : type === 'video' ? (
        <span className="absolute top-1 left-1
                         bg-white/15 text-white/70
                         text-[7px] font-semibold px-1 py-0.5 rounded leading-none">
          NORMAL
        </span>
      ) : null}
    </button>
  )
}

// ─── Inline recordedAt editor (in playlist) ───────────────────────────────────

function RecordedAtEditor({ media, diveId }) {
  const queryClient = useQueryClient()
  const toLocal = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    const pad = n => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
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
    } catch {}
    setSaving(false)
  }

  return (
    <div className="px-1 pb-1">
      <p className="text-[9px] text-white/40 mb-0.5 uppercase tracking-wider">Sync start time</p>
      <div className="flex gap-1">
        <input
          type="datetime-local"
          value={val}
          onChange={e => setVal(e.target.value)}
          style={{ colorScheme: 'dark' }}
          className="flex-1 min-w-0 text-[10px] px-1.5 py-1 rounded border border-white/20
                     bg-white/5 text-white/70 focus:outline-none focus:border-blue-400" />
        <button onClick={handleSave} disabled={saving}
          className="shrink-0 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500
                     text-white text-[10px] font-bold disabled:opacity-40 transition-colors">
          {saving ? '…' : '✓'}
        </button>
      </div>
    </div>
  )
}

// ─── Custom video controls (replaces native controls for unified hover UX) ────

function RetryAnalysisButton({ mediaId, diveId, queryClient }) {
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

function AIAnalyzePopover({ media, diveId, canUse, portalTarget }) {
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
      {/* Trigger button — replaces the old plain ⟳ button */}
      <button ref={btnRef} onClick={toggle}
        title="AI Analysis settings"
        className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5
                   text-[11px] font-bold rounded-full transition-all select-none
                   backdrop-blur-sm border shadow-lg ${
          open
            ? 'bg-violet-500/90 border-violet-400/60 text-white'
            : isPending
              ? 'bg-black/50 border-white/20 text-white animate-pulse'
              : 'bg-black/50 border-white/20 text-white hover:bg-black/70 hover:border-white/30'
        }`}>
        <Sparkles size={11} />
        {isPending ? 'Analyzing…' : 'Analyze'}
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
          <div className="px-4 pt-3 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Model</p>
            <div className="space-y-1">
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
                      <span className="block text-[12px] font-medium leading-none">{label}</span>
                      <span className="block text-[10px] text-white/40 mt-0.5">{desc}</span>
                      {warning && (
                        <span className="block text-[10px] text-amber-400/80 mt-0.5">⚠ {warning}</span>
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
function CustomVideoControls({ videoRef, isPlaying, mediaId, containerRef, currentTime, duration, isFullscreen }) {
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
    if (!s || isNaN(s)) return '0:00'
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
    <div className="absolute bottom-0 left-0 right-0 z-30
                    opacity-0 group-hover:opacity-100 transition-opacity duration-200
                    pointer-events-none group-hover:pointer-events-auto
                    px-3 pt-8 pb-2
                    bg-gradient-to-t from-black/75 via-black/30 to-transparent">
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

function DetectionSVG({ labels, dims }) {
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

function MainMedia({ media, videoRef, containerRef, activeLabs, onEnded, onTimeUpdate, onPlay, onPause, onLoadedMetadata, showDetections }) {
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

// ─── Chart tooltip ────────────────────────────────────────────────────────────

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
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, color }) {
  return (
    <div className="bg-background rounded-lg px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
          {value ?? '—'}
        </span>
        <span className="text-xs text-muted-foreground">{unit}</span>
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
}

// ─── Evidence Panel ───────────────────────────────────────────────────────────

function fmtVideoTime(sec) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function EvidenceCard({ snap, canEdit, diveId, queryClient, onSeek }) {
  const [note,       setNote]       = useState(snap.note || '')
  const [analyzing,  setAnalyzing]  = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const saveNote = async () => {
    if (note === snap.note) return
    try { await api.patch(`/snapshots/${snap._id}/note`, { note }) } catch {}
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      await api.post(`/snapshots/${snap._id}/analyze`, { model: 'yolov8n', confidence: 0.3 })
      queryClient.invalidateQueries({ queryKey: ['snapshots', diveId] })
    } catch {}
    setAnalyzing(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/snapshots/${snap._id}`)
      queryClient.invalidateQueries({ queryKey: ['snapshots', diveId] })
    } catch { setDeleting(false) }
  }

  const isClip   = snap.type === 'clip'
  const timeLabel = isClip
    ? `${fmtVideoTime(snap.startTime)} → ${fmtVideoTime(snap.endTime)}`
    : fmtVideoTime(snap.imageTime)
  const isPending = snap.analysisStatus === 'pending'
  const isDone    = snap.analysisStatus === 'done'
  const isFailed  = snap.analysisStatus === 'failed'

  // Deduplicate by class name, keep highest confidence
  const uniqueLabels = snap.aiLabels?.length > 0
    ? [...new Map(snap.aiLabels.map(l => [l.name, l])).values()].slice(0, 4)
    : []

  return (
    <div className="rounded-lg overflow-hidden border border-white/10 bg-white/5 group/card">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-slate-800 cursor-pointer"
           onClick={() => onSeek(isClip ? snap.startTime : snap.imageTime)}>
        {snap.thumbnailUrl
          ? <img src={snap.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center">
              <FileText size={16} className="text-slate-500" />
            </div>
        }
        <span className={`absolute top-1 left-1 text-[8px] font-bold px-1.5 py-0.5
                          rounded leading-none
                          ${isClip ? 'bg-violet-500/90 text-white' : 'bg-blue-500/90 text-white'}`}>
          {isClip ? '🎬' : '📷'}
        </span>
        <span className="absolute bottom-1 right-1 text-[8px] font-mono
                         bg-black/70 text-white/80 px-1 py-0.5 rounded">
          {timeLabel}
        </span>
        {canEdit && (
          <button onClick={e => { e.stopPropagation(); handleDelete() }}
            disabled={deleting}
            className="absolute top-1 right-1 p-1 rounded bg-red-900/80 text-red-300
                       opacity-0 group-hover/card:opacity-100 transition-opacity
                       hover:bg-red-800/80 disabled:opacity-30 pointer-events-auto">
            {deleting ? <Loader size={8} className="animate-spin" /> : <X size={8} />}
          </button>
        )}
      </div>

      {/* AI labels */}
      {uniqueLabels.length > 0 && (
        <div className="flex flex-wrap gap-0.5 px-1.5 pt-1.5">
          {uniqueLabels.map(l => (
            <span key={l.name}
              className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none
                          ${l.confidence > 0.8 ? 'bg-blue-500/70 text-white' : 'bg-amber-500/70 text-white'}`}>
              {l.name} {Math.round(l.confidence * 100)}%
            </span>
          ))}
        </div>
      )}

      {/* Analyze */}
      {canEdit && (
        <div className="px-1.5 pt-1">
          <button onClick={handleAnalyze}
            disabled={isPending || analyzing}
            className={`w-full flex items-center justify-center gap-1 py-1 rounded
                        text-[9px] font-bold transition-colors
                        ${isPending || analyzing
                          ? 'bg-blue-900/40 text-blue-400 cursor-wait'
                          : isFailed
                            ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60'
                            : isDone
                              ? 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                              : 'bg-white/8 text-white/60 hover:bg-white/15 hover:text-white'}`}>
            {isPending || analyzing
              ? <><Loader size={9} className="animate-spin" /> Analyzing…</>
              : isFailed
                ? <><AlertTriangle size={9} /> Retry</>
                : isDone
                  ? <><Sparkles size={9} /> Re-analyze</>
                  : <><Sparkles size={9} /> Analyze</>}
          </button>
        </div>
      )}

      {/* Note */}
      <div className="px-1.5 pb-1.5 pt-1">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={saveNote}
          placeholder="Add note…"
          className="w-full text-[9px] bg-transparent border-b border-white/10
                     focus:border-white/30 focus:outline-none text-white/60 pb-0.5
                     placeholder:text-white/25" />
      </div>
    </div>
  )
}

function EvidencePanel({ snapshots, isOpen, diveId, canEdit, videoRef, queryClient }) {
  return (
    <div className={`absolute top-0 left-0 bottom-0 z-10 w-52
                     bg-black/92 backdrop-blur-sm border-r border-white/10
                     overflow-y-auto flex flex-col
                     transition-transform duration-200 ease-out
                     ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-3 py-2.5 border-b border-white/10 shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Evidence</p>
        <p className="text-[8px] text-white/30 mt-0.5">
          {snapshots.length} item{snapshots.length !== 1 ? 's' : ''}
        </p>
      </div>

      {snapshots.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
          <Camera size={20} className="text-white/20" />
          <p className="text-[9px] text-white/30 text-center leading-relaxed">
            No evidence yet.<br />
            Use 📷 or 🎬 while<br />
            video is playing.
          </p>
        </div>
      ) : (
        <div className="p-1.5 flex flex-col gap-1.5 pb-16">
          {snapshots.map(snap => (
            <EvidenceCard
              key={snap._id}
              snap={snap}
              canEdit={canEdit}
              diveId={diveId}
              queryClient={queryClient}
              onSeek={(t) => {
                const v = videoRef.current
                if (v && t != null) { v.currentTime = t; v.play().catch(() => {}) }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiveDetailPage() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const location    = useLocation()
  const { user }    = useAuthStore()
  const { isDark }  = useThemeStore()
  const queryClient = useQueryClient()

  const [showForm,        setShowForm]       = useState(false)
  const [showUpload,      setShowUpload]     = useState(false)
  const [showSensorUp,    setShowSensorUp]   = useState(false)
  const [selIdx,          setSelIdx]         = useState(() => {
    const saved = sessionStorage.getItem(`dive:${id}:mediaIdx`)
    return saved ? parseInt(saved, 10) : 0
  })
  const [showDetections,  setShowDetections] = useState(false)
  const [isVideoPlaying,  setIsVideoPlaying] = useState(false)
  const [currentVideoTime, setCurrentVideoTime] = useState(0)
  const [videoDuration,   setVideoDuration]  = useState(0)
  const [hidden,          setHidden]         = useState({})
  const [chartTab,        setChartTab]       = useState('env')
  const [chartExpanded,   setChartExpanded]  = useState(false)
  const [isPlaylistOpen,      setIsPlaylistOpen]      = useState(false)
  const [selectedClass,       setSelectedClass]       = useState(null)
  const [isEvidencePanelOpen, setIsEvidencePanelOpen] = useState(false)
  const [clipStart,           setClipStart]           = useState(null)
  const [isCapturingPhoto,    setIsCapturingPhoto]    = useState(false)

  const videoRef          = useRef(null)
  const containerRef      = useRef(null)
  const chartContainerRef = useRef(null)
  const exportRef         = useRef(null)
  const [syncTs,        setSyncTs]      = useState(null)
  const [showExport,    setShowExport]  = useState(false)
  const [isFullscreen,  setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const backTo    = location.state?.from || '/dives'
  const canEdit   = ['admin', 'operator'].includes(user?.role)
  const canUpload = ['admin', 'operator'].includes(user?.role)

  const { data: dive, isLoading, isError } = useQuery({
    queryKey: ['dives', id],
    queryFn:  () => api.get(`/dives/${id}`).then(r => r.data),
    staleTime: 30000,
  })
  const { data: mediaList = [] } = useQuery({
    queryKey: ['media', id],
    queryFn:  () => api.get(`/media/dive/${id}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: (data) => data?.some?.(m => m.analysisStatus === 'pending') ? 4000 : false,
  })
  const { data: snapshots = [] } = useQuery({
    queryKey: ['snapshots', id],
    queryFn:  () => api.get(`/snapshots/dive/${id}`).then(r => r.data),
    staleTime: 30000,
    refetchInterval: (data) => data?.some?.(s => s.analysisStatus === 'pending') ? 4000 : false,
  })

  // Auto-open playlist once when multiple media items load
  const didAutoOpen = useRef(false)
  useEffect(() => {
    if (mediaList.length > 1 && !didAutoOpen.current) {
      didAutoOpen.current = true
      setIsPlaylistOpen(true)
    }
  }, [mediaList.length])

  const hasSensor = (dive?.sensorCount || 0) > 0
  const { data: sensorData } = useQuery({
    queryKey: ['sensor', id],
    queryFn:  () => api.get(`/dives/${id}/sensor-data`).then(r => r.data),
    enabled:  hasSensor,
    staleTime: 5 * 60 * 1000,
  })

  const anomalySet = useMemo(() => {
    if (!sensorData?.anomalies) return new Set()
    return new Set(sensorData.anomalies.map(a => `${a.metric}:${a.timestamp}`))
  }, [sensorData])

  const chartData = sensorData?.data      ?? []
  const stats     = sensorData?.stats     ?? null
  const anomalies = sensorData?.anomalies ?? []
  const media     = mediaList[selIdx] ?? null
  const hasNavData   = chartData.some(d => d.yaw   != null || d.pitch           != null || d.roll != null)
  const hasPowerData = chartData.some(d => d.voltage != null || d.battery_percent != null || d.humidity != null)

  // Persist selected media index to sessionStorage so F5 restores same file
  useEffect(() => {
    if (mediaList.length > 0) sessionStorage.setItem(`dive:${id}:mediaIdx`, selIdx)
  }, [selIdx, mediaList.length, id])

  // Clamp saved index if mediaList shrinks (e.g. after delete)
  useEffect(() => {
    if (mediaList.length > 0 && selIdx >= mediaList.length) setSelIdx(mediaList.length - 1)
  }, [mediaList.length])

  // Reset sync state + class filter when switching media
  useEffect(() => {
    setSyncTs(null); setCurrentVideoTime(0); setSelectedClass(null); setVideoDuration(0)
  }, [media?._id])

  // Per-frame when ANY label has a frameTime — simple and handles unique-class-per-frame edge case
  const hasPerFrame = useMemo(() => {
    const labs = media?.labels
    if (!labs?.length) return false
    return labs.some(l => l.frameTime != null)
  }, [media?.labels])

  const activeLabs = useMemo(() => {
    const labs = media?.labels
    if (!labs?.length) return []
    if (!hasPerFrame || resolveType(media) !== 'video') return labs
    const withFrame = labs.filter(l => l.frameTime != null)
    if (!withFrame.length) return labs
    const nearestTime = withFrame.reduce((best, l) =>
      Math.abs(l.frameTime - currentVideoTime) < Math.abs(best - currentVideoTime) ? l.frameTime : best,
      withFrame[0].frameTime)
    // Hide when nearest detection is more than 0.2s away (sparse or end-of-video)
    if (Math.abs(nearestTime - currentVideoTime) > 0.7) return []
    return withFrame.filter(l => l.frameTime === nearestTime)
  }, [media?.labels, hasPerFrame, currentVideoTime])

  // Per-class summary for badge bar: { name, count, maxConf }[], sorted by maxConf desc
  const classGroups = useMemo(() => {
    if (!activeLabs.length) return []
    const map = {}
    activeLabs.forEach(l => {
      if (!map[l.name]) map[l.name] = { name: l.name, count: 0, maxConf: 0 }
      map[l.name].count++
      if (l.confidence > map[l.name].maxConf) map[l.name].maxConf = l.confidence
    })
    return Object.values(map).sort((a, b) => b.maxConf - a.maxConf)
  }, [activeLabs])

  // Labels passed to DetectionSVG — filtered by selectedClass when active
  const visibleLabs = useMemo(() =>
    selectedClass ? activeLabs.filter(l => l.name === selectedClass) : activeLabs
  , [activeLabs, selectedClass])

  const handleVideoEnded = useCallback(() => {}, [])

  const handleLoadedMetadata = useCallback((e) => {
    setVideoDuration(e.target.duration || 0)
    setCurrentVideoTime(0)
  }, [])

  // Update sync timestamp and current time on video timeupdate
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (media?.recordedAt) setSyncTs(new Date(media.recordedAt).getTime() + video.currentTime * 1000)
    setCurrentVideoTime(video.currentTime)
    // Keep duration in sync in case it wasn't available at loadedmetadata time
    if (video.duration && video.duration !== videoDuration) setVideoDuration(video.duration)
  }, [media?.recordedAt, videoDuration])

  // Capture current video frame + bbox overlay → POST /snapshots
  const capturePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video || !media || resolveType(media) !== 'video') return
    setIsCapturingPhoto(true)
    try {
      const w = video.videoWidth  || 640
      const h = video.videoHeight || 360
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, w, h)
      // Burn visible bbox overlay into the frame
      if (showDetections && visibleLabs.length > 0) {
        visibleLabs.filter(l => l.bbox).forEach(l => {
          const { x1, y1, x2, y2 } = l.bbox
          const bx = x1 * w, by = y1 * h, bw = (x2 - x1) * w, bh = (y2 - y1) * h
          const color = l.confidence > 0.8 ? '#60a5fa' : '#fbbf24'
          const sw    = Math.max(w * 0.003, 2)
          const fs    = Math.max(h * 0.028, 12)
          ctx.strokeStyle = color; ctx.lineWidth = sw
          ctx.strokeRect(bx, by, bw, bh)
          const label = `${l.name} ${Math.round(l.confidence * 100)}%`
          ctx.font = `bold ${fs}px system-ui,sans-serif`
          const lw = ctx.measureText(label).width + 8
          ctx.fillStyle = color
          ctx.fillRect(bx, Math.max(0, by - fs * 1.6), lw, fs * 1.6)
          ctx.fillStyle = 'black'
          ctx.fillText(label, bx + 4, Math.max(fs * 1.25, by - fs * 0.35))
        })
      }
      await api.post('/snapshots', {
        type: 'photo',
        diveId: id,
        parentMediaId: media._id,
        imageTime: video.currentTime,
        dataUrl: canvas.toDataURL('image/png'),
      })
      await queryClient.invalidateQueries({ queryKey: ['snapshots', id] })
      setIsEvidencePanelOpen(true)
    } catch (e) { console.error('capturePhoto:', e) }
    setIsCapturingPhoto(false)
  }, [id, media, showDetections, visibleLabs, videoRef, queryClient])

  // Mark clip start / stop → save clip evidence with thumbnail
  const toggleClipRecording = useCallback(async () => {
    const video = videoRef.current
    if (!video || !media || resolveType(media) !== 'video') return
    if (clipStart === null) {
      setClipStart(video.currentTime)
    } else {
      const startTime = clipStart
      const endTime   = video.currentTime
      setClipStart(null)
      if (endTime <= startTime) return
      const w = video.videoWidth || 640, h = video.videoHeight || 360
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(video, 0, 0, w, h)
      try {
        await api.post('/snapshots', {
          type: 'clip',
          diveId: id,
          parentMediaId: media._id,
          startTime, endTime,
          dataUrl: canvas.toDataURL('image/png'),
        })
        await queryClient.invalidateQueries({ queryKey: ['snapshots', id] })
        setIsEvidencePanelOpen(true)
      } catch (e) { console.error('clipRecord:', e) }
    }
  }, [id, media, clipStart, videoRef, queryClient])

  // Find closest chart data point to current video sync position
  const syncIdx = useMemo(() => {
    if (syncTs == null || chartData.length === 0) return null
    let closest = 0, minDiff = Infinity
    chartData.forEach((d, i) => {
      const diff = Math.abs(new Date(d.timestamp).getTime() - syncTs)
      if (diff < minDiff) { minDiff = diff; closest = i }
    })
    return closest
  }, [syncTs, chartData])

  const currentReading = syncIdx != null ? chartData[syncIdx] : null

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const exportCsv = () => {
    if (!chartData.length) return
    const headers = 'timestamp,depth,temp,pressure'
    const rows = chartData.map(d =>
      [d.timestamp, d.depth ?? '', d.temp ?? '', d.pressure ?? ''].join(',')
    )
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `${dive?.title || 'sensor'}-data.csv`,
    })
    a.click(); URL.revokeObjectURL(url)
  }

  const exportChartPng = () => {
    const svgEl = chartContainerRef.current?.querySelector('svg')
    if (!svgEl) return
    const w = svgEl.clientWidth, h = svgEl.clientHeight
    const canvas = document.createElement('canvas')
    canvas.width = w * 2; canvas.height = h * 2
    const ctx = canvas.getContext('2d')
    ctx.scale(2, 2)
    ctx.fillStyle = isDark ? '#1f2937' : '#ffffff'
    ctx.fillRect(0, 0, w, h)
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h)
      Object.assign(document.createElement('a'), {
        href: canvas.toDataURL('image/png'),
        download: `${dive?.title || 'sensor'}-chart.png`,
      }).click()
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svgEl))}`
  }

  // ── loading ──
  if (isLoading) return (
    <div className="-m-4 md:-m-6 h-[calc(100vh-4rem)] flex flex-col gap-3 p-3 overflow-hidden bg-background">
      <Skeleton className="h-14 w-full rounded-xl shrink-0" />
      <div className="flex-1 min-h-0 flex gap-3">
        <Skeleton className="w-56 flex-none rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
        <Skeleton className="w-56 flex-none rounded-xl" />
      </div>
      <Skeleton className="h-44 w-full flex-none rounded-xl" />
    </div>
  )

  if (isError || !dive) throw new Error('Dive not found')

  const { text: sText, cls: sCls } = STATUS[dive.status] || STATUS.pending
  const hasGps = dive.gpsLocation?.lat != null && dive.gpsLocation?.lng != null

  return (
    <div className="-m-4 md:-m-6 h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-background">

      {/* ══════════════════════════════════════════════════════════════ HEADER */}
      <header className="h-14 flex-none flex items-center gap-3 px-5
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
      </header>

      {/* ═══════════════════════════════════════════════════════════ MIDDLE ROW */}
      <div className="flex-1 min-h-0 flex gap-3 p-3">

        {/* ─── LEFT COLUMN (w-56) ─── */}
        <div className="w-56 flex-none flex flex-col gap-3">

          {/* Location / Map */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-card border border-border overflow-hidden">
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
          </div>

          {/* Current Status KPIs */}
          <div className="flex-none rounded-xl bg-card border border-border p-3">
            <SectionLabel>Current Status</SectionLabel>
            <div className="space-y-2">
              <KpiCard label="Depth"    value={stats?.depth?.avg    ?? '—'} unit="m"   color="#3b82f6" />
              <KpiCard label="Temp"     value={stats?.temp?.avg     ?? '—'} unit="°c"  color="#f59e0b" />
              <KpiCard label="Pressure" value={stats?.pressure?.avg ?? '—'} unit="bar" color="#10b981" />
            </div>
          </div>

        </div>

        {/* ─── CENTER COLUMN ───────────────────────────────────────────────── */}
        {/* bg-black intentional: video player is always dark regardless of app theme */}
        <div ref={containerRef} className="group flex-1 min-h-0 bg-black rounded-xl overflow-hidden relative flex items-center justify-center">

          <MainMedia media={media} videoRef={videoRef} containerRef={containerRef}
            activeLabs={visibleLabs}
            onEnded={handleVideoEnded} onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsVideoPlaying(true)}
            onPause={() => setIsVideoPlaying(false)}
            onLoadedMetadata={handleLoadedMetadata}
            showDetections={showDetections} />

          {/* Top gradient overlay — hidden until hover, then reveals filename + buttons */}
          {media && (
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between
                            px-3 py-2.5 pointer-events-none
                            bg-gradient-to-b from-black/60 to-transparent
                            opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <span className="text-[11px] text-white/55 truncate max-w-[140px]">
                {media.originalName}
              </span>
              <div className="flex items-center gap-1.5">
                {media?.analysisStatus === 'done' && (
                  <button
                    onClick={() => setShowDetections(v => !v)}
                    className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5
                               text-[11px] font-bold rounded-full transition-colors select-none
                               backdrop-blur-sm border shadow-lg ${
                      showDetections
                        ? 'bg-blue-500/90 border-blue-400/50 text-white'
                        : 'bg-black/50 border-white/20 text-white hover:bg-black/70'
                    }`}>
                    {showDetections ? <EyeOff size={11} /> : <Eye size={11} />}
                    {showDetections ? 'Hide' : `Detect${media.labels?.length ? ` · ${media.labels.length > 99 ? '99+' : media.labels.length}` : ''}`}
                  </button>
                )}
                <AIAnalyzePopover media={media} diveId={id} canUse={canUpload}
                  portalTarget={isFullscreen ? containerRef.current : document.body} />

                {/* Photo capture */}
                {canUpload && media && resolveType(media) === 'video' && (
                  <button onClick={capturePhoto} disabled={isCapturingPhoto}
                    title="Capture current frame as evidence photo"
                    className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1.5
                               text-[11px] font-bold rounded-full transition-colors select-none
                               backdrop-blur-sm border shadow-lg
                               ${isCapturingPhoto
                                 ? 'bg-black/50 border-white/20 text-white/40 cursor-wait'
                                 : 'bg-black/50 border-white/20 text-white hover:bg-white/15'}`}>
                    {isCapturingPhoto
                      ? <Loader size={11} className="animate-spin" />
                      : <Camera size={11} />}
                  </button>
                )}

                {/* Clip record */}
                {canUpload && media && resolveType(media) === 'video' && (
                  <button onClick={toggleClipRecording}
                    title={clipStart === null ? 'Mark clip start' : `Recording from ${fmtVideoTime(clipStart)} — click to stop`}
                    className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1.5
                               text-[11px] font-bold rounded-full transition-colors select-none
                               backdrop-blur-sm border shadow-lg
                               ${clipStart !== null
                                 ? 'bg-red-500/90 border-red-400/50 text-white animate-pulse'
                                 : 'bg-black/50 border-white/20 text-white hover:bg-white/15'}`}>
                    {clipStart !== null
                      ? <><Square size={11} fill="currentColor" /> {fmtVideoTime(clipStart)}</>
                      : <Clapperboard size={11} />}
                  </button>
                )}

                {/* Evidence panel toggle */}
                <button onClick={() => setIsEvidencePanelOpen(v => !v)}
                  title="Evidence panel"
                  className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1.5
                             text-[11px] font-bold rounded-full transition-colors select-none
                             backdrop-blur-sm border shadow-lg
                             ${isEvidencePanelOpen
                               ? 'bg-emerald-500/90 border-emerald-400/50 text-white'
                               : 'bg-black/50 border-white/20 text-white hover:bg-white/15'}`}>
                  <Images size={11} />
                  {snapshots.length > 0 && <span>{snapshots.length}</span>}
                </button>

                {mediaList.length > 1 && (
                  <button
                    onClick={() => setIsPlaylistOpen(v => !v)}
                    className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5
                               text-[11px] font-semibold rounded-full transition-colors select-none
                               backdrop-blur-sm border border-white/20
                               bg-white/10 hover:bg-white/20 text-white">
                    <Film size={11} />
                    <span>{isPlaylistOpen ? 'Hide' : mediaList.length}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* LIVE SYNC badge — rests at top-left corner, slides down below filename bar on hover */}
          {syncTs != null && (
            <div className="absolute top-3 group-hover:top-10 left-3 z-30 pointer-events-none
                            transition-[top] duration-200 ease-out
                            flex items-center gap-1.5 px-2.5 py-1 rounded-full select-none
                            bg-red-500/90 backdrop-blur-sm text-white text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
              LIVE SYNC
            </div>
          )}

          {/* YOLOv8 class badges — grouped by class, hover to show, click to filter bbox */}
          {showDetections && classGroups.length > 0 && (
            <div className="absolute bottom-2 group-hover:bottom-14 left-0 right-0 z-50
                            opacity-0 group-hover:opacity-100
                            transition-[bottom,opacity] duration-200 ease-out
                            px-3 flex flex-wrap gap-1.5 pointer-events-none">
              {classGroups.map(g => {
                const isSelected = selectedClass === g.name
                const isOther    = selectedClass !== null && !isSelected
                const isHigh     = g.maxConf > 0.8
                return (
                  <button key={g.name}
                    onClick={() => setSelectedClass(prev => prev === g.name ? null : g.name)}
                    title={`Click to ${isSelected ? 'show all' : 'filter to ' + g.name + ' only'}`}
                    className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1
                                text-[10px] font-bold rounded-full leading-none select-none
                                backdrop-blur-sm border transition-all duration-150
                                cursor-pointer hover:scale-105 active:scale-95 ${
                      isSelected
                        ? 'ring-2 ring-white/80 scale-105 ' + (isHigh
                            ? 'bg-blue-500 border-blue-300/60 text-white'
                            : 'bg-amber-500 border-amber-300/60 text-white')
                        : isOther
                          ? 'opacity-35 ' + (isHigh
                              ? 'bg-blue-500/60 border-blue-400/30 text-white/80'
                              : 'bg-amber-500/60 border-amber-400/30 text-white/80')
                          : (isHigh
                              ? 'bg-blue-500/85 border-blue-400/30 text-white'
                              : 'bg-amber-500/85 border-amber-400/30 text-white')
                    }`}>
                    <span>{g.name}</span>
                    {g.count > 1 && (
                      <span className="opacity-70">×{g.count}</span>
                    )}
                    <span className="opacity-80">· {Math.round(g.maxConf * 100)}%</span>
                  </button>
                )
              })}
              {selectedClass && (
                <button onClick={() => setSelectedClass(null)}
                  className="pointer-events-auto px-2 py-1 text-[10px] font-bold rounded-full
                             bg-white/15 border border-white/25 text-white/70
                             hover:bg-white/25 hover:text-white transition-all select-none">
                  ✕ all
                </button>
              )}
            </div>
          )}

          {/* Analysis status indicator */}
          {media?.analysisStatus === 'pending' && (
            <div className="absolute bottom-2 group-hover:bottom-14 right-3 z-50 pointer-events-none
                            flex items-center gap-1 px-2 py-1 rounded-full
                            bg-black/60 backdrop-blur-sm text-white/60 text-[9px] font-medium
                            transition-[bottom] duration-200 ease-out">
              <Loader size={9} className="animate-spin" /> Analyzing…
            </div>
          )}
          {media?.analysisStatus === 'failed' && (
            <RetryAnalysisButton mediaId={media._id} diveId={id}
              queryClient={queryClient} />
          )}

          {/* Evidence panel ─ slides in from left, independent of playlist */}
          <EvidencePanel
            snapshots={snapshots}
            isOpen={isEvidencePanelOpen}
            diveId={id}
            canEdit={canUpload}
            videoRef={videoRef}
            queryClient={queryClient}
          />

          {/* Playlist overlay ─ slides in from right as an absolute panel */}
          <div className={`absolute top-0 right-0 bottom-0 z-10 w-44
                           bg-black/90 backdrop-blur-sm border-l border-white/10
                           overflow-y-auto
                           transition-transform duration-200 ease-out
                           ${isPlaylistOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-2 pb-16 flex flex-col gap-2">
              {mediaList.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10">
                  <File size={20} className="text-slate-600" />
                  <p className="text-[10px] text-slate-500 text-center">No files uploaded</p>
                </div>
              ) : (
                mediaList.map((m, i) => (
                  <div key={m._id} className="flex flex-col gap-1">
                    <ThumbVertical
                      media={m}
                      active={i === selIdx}
                      onClick={() => setSelIdx(i)}
                      label={`${resolveType(m) === 'video' ? 'Video' : 'Photo'} ${i + 1}`} />
                    {/* recordedAt editor shown for the selected video */}
                    {i === selIdx && resolveType(m) === 'video' && (
                      <RecordedAtEditor media={m} diveId={id} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Custom video controls — unified with all overlays under same group-hover */}
          {media && resolveType(media) === 'video' && (
            <CustomVideoControls
              videoRef={videoRef}
              isPlaying={isVideoPlaying}
              mediaId={media._id}
              containerRef={containerRef}
              currentTime={currentVideoTime}
              duration={videoDuration}
              isFullscreen={isFullscreen}
            />
          )}

          {/* Exit-fullscreen button — shown when fullscreen but NOT a video (image/other has no video controls) */}
          {isFullscreen && media && resolveType(media) !== 'video' && (
            <button
              onClick={e => { e.stopPropagation(); document.exitFullscreen() }}
              className="absolute bottom-3 right-3 z-30 p-1.5 rounded-lg
                         opacity-0 group-hover:opacity-100 transition-opacity duration-200
                         bg-black/60 hover:bg-black/80 text-white">
              <Minimize2 size={15} />
            </button>
          )}

        </div>

        {/* ─── RIGHT COLUMN (w-56) ─── */}
        <div className="w-56 flex-none flex flex-col gap-3">

          {/* Navigation gauges */}
          <div className="flex-none rounded-xl bg-card border border-border p-3">
            <SectionLabel>Navigation</SectionLabel>
            <div className="flex items-center justify-around pt-1">
              <ArtificialHorizon
                pitch={currentReading?.pitch ?? 0}
                roll={currentReading?.roll  ?? 0}
                active={currentReading != null} />
              <CompassRose
                yaw={currentReading?.yaw ?? 0}
                active={currentReading != null} />
            </div>
          </div>

          {/* Alerts */}
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

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ BOTTOM CHART */}
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

      </div>

      {/* ── modals ── */}
      {showForm && (
        <DiveForm tripId={dive.trip?._id} diveData={dive} onClose={() => setShowForm(false)} />
      )}
      {showUpload && (
        <MediaUpload diveId={id} tripId={dive.trip?._id} onClose={() => setShowUpload(false)} />
      )}
      {showSensorUp && (
        <SensorUpload dive={dive} tripId={dive.trip?._id} tripGpsLocation={null}
          onClose={() => setShowSensorUp(false)} />
      )}
    </div>
  )
}
