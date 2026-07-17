import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useThemeStore } from '@/store/theme.store'
import {
  ArrowLeft, Anchor, Activity, Upload, Pencil,
  AlertTriangle, File, FileText, CheckCircle2,
  Maximize2, Minimize2, Download, Radio, Sparkles, Film, Loader, Eye, EyeOff,
  Play, Pause, Volume2, VolumeX,
  Camera, Clapperboard, Square, Images, X, MoreVertical, Clock, Info, Trash2,
  Waves, Navigation2,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Brush,
} from 'recharts'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import ArtificialHorizon from './components/ArtificialHorizon'
import CompassRose from './components/CompassRose'
import ROVDataUpload from './components/ROVDataUpload'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { SectionLabel } from './components/ui/SectionLabel'
import { TripHeader } from './components/layout/TripHeader'
import { LocationPanel } from './components/layout/LocationPanel'
import { AlertsPanel } from './components/layout/AlertsPanel'
import { CurrentStatus } from './components/layout/CurrentStatus'
import { TrajectoryViewer } from './components/TrajectoryViewer'
import { BottomChart } from './components/charts/BottomChart'
import DataFilesModal from './components/DataFilesModal'
import SonarViewer from './components/SonarViewer/SonarViewer'
import { ThumbVertical, MainMedia, useMediaUrl, resolveType, AIAnalyzePopover, RecordedAtEditor, RetryAnalysisButton, CustomVideoControls, DetectionSVG, fmtVideoTime } from './components/media/MediaShared'
import { EvidencePanel, EvidenceViewer } from './components/evidence/EvidenceShared'
import { toast } from 'sonner'
import 'leaflet/dist/leaflet.css'

// ─── Status ──────────────────────────────────────────────────────────────────

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-muted text-muted-foreground' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  done: { text: 'Done', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  failed: { text: 'Failed', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
}

// ─── DataFilesLeftPanel — compact per-file list for left column ───────────────

function DataFilesLeftPanel({ tripId, canEdit, queryClient }) {
  const [open, setOpen] = useState(true)
  const [deleting, setDeleting] = useState(null)

  const { data: fileData } = useQuery({
    queryKey: ['data-files', tripId],
    queryFn: () => api.get(`/trips/${tripId}/data-files`).then(r => r.data),
    staleTime: 30_000,
  })

  const sensor = fileData?.sensor ?? []
  const dvl    = fileData?.dvl    ?? []
  const sonar  = fileData?.sonar  ?? []
  const total  = sensor.length + dvl.length + sonar.length
  if (!fileData || total === 0) return null

  const fmtN   = n => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
  const fmtDur = ms => { if (!ms) return ''; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m${s % 60}s` }
  const fmtHM  = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  const doDelete = async (type, file, sonarId) => {
    const key = `${type}-${file}`
    setDeleting(key)
    try {
      if (type === 'sensor') {
        await api.delete(`/trips/${tripId}/sensor-data?file=${encodeURIComponent(file)}`)
        queryClient.invalidateQueries({ queryKey: ['sensor', tripId] })
      } else if (type === 'dvl') {
        await api.delete(`/trips/${tripId}/dvl?file=${encodeURIComponent(file)}`)
        queryClient.invalidateQueries({ queryKey: ['dvl-path', tripId] })
      } else {
        await api.delete(`/trips/${tripId}/sonar/${sonarId}`)
        queryClient.invalidateQueries({ queryKey: ['sonar-list', tripId] })
      }
      queryClient.invalidateQueries({ queryKey: ['data-files', tripId] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
    } catch { toast.error('Failed to delete file') }
    finally { setDeleting(null) }
  }

  return (
    <div className="flex-none rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors">
        <span className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
          Data Files <span className="normal-case font-normal ml-1 text-muted-foreground/70">({total})</span>
        </span>
        <span className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-border max-h-32 overflow-y-auto px-2 py-1.5 space-y-0.5">
          {sensor.map(f => {
            const k = `sensor-${f.sourceFile}`
            return (
              <div key={f.sourceFile} className="flex items-center gap-1.5 py-1 group/row">
                <Activity size={9} className="text-blue-500 shrink-0" />
                <span className="flex-1 min-w-0 font-mono text-[9px] text-foreground truncate" title={f.sourceFile}>
                  {f.sourceFile}
                </span>
                <span className="text-[9px] text-muted-foreground shrink-0">{fmtN(f.count)}r</span>
                {f.minTs && <span className="text-[9px] text-muted-foreground shrink-0">{fmtHM(f.minTs)}</span>}
                {canEdit && (
                  <button onClick={() => doDelete('sensor', f.sourceFile)}
                    disabled={deleting === k}
                    className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all shrink-0 disabled:opacity-40">
                    {deleting === k ? <Loader size={9} className="animate-spin" /> : <X size={9} />}
                  </button>
                )}
              </div>
            )
          })}
          {dvl.map(f => {
            const k = `dvl-${f.sourceFile}`
            return (
              <div key={f.sourceFile} className="flex items-center gap-1.5 py-1 group/row">
                <Navigation2 size={9} className="text-purple-500 shrink-0" />
                <span className="flex-1 min-w-0 font-mono text-[9px] text-foreground truncate" title={f.sourceFile}>
                  {f.sourceFile}
                </span>
                <span className="text-[9px] text-muted-foreground shrink-0">{fmtN(f.count)}pt</span>
                {canEdit && (
                  <button onClick={() => doDelete('dvl', f.sourceFile)}
                    disabled={deleting === k}
                    className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all shrink-0 disabled:opacity-40">
                    {deleting === k ? <Loader size={9} className="animate-spin" /> : <X size={9} />}
                  </button>
                )}
              </div>
            )
          })}
          {sonar.map(f => {
            const k = `sonar-${f._id}`
            return (
              <div key={f._id} className="flex items-center gap-1.5 py-1 group/row">
                <Waves size={9} className="text-cyan-500 shrink-0" />
                <span className="flex-1 min-w-0 font-mono text-[9px] text-foreground truncate" title={f.filename}>
                  {f.filename}
                </span>
                <span className="text-[9px] text-muted-foreground shrink-0">{fmtN(f.frameCount)}f</span>
                {f.durationMs && <span className="text-[9px] text-muted-foreground shrink-0">{fmtDur(f.durationMs)}</span>}
                {canEdit && (
                  <button onClick={() => doDelete('sonar', f.filename, f._id)}
                    disabled={deleting === k}
                    className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all shrink-0 disabled:opacity-40">
                    {deleting === k ? <Loader size={9} className="animate-spin" /> : <X size={9} />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TripDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const { isDark } = useThemeStore()
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [showROVUpload, setShowROVUpload] = useState(false)
  const [selIdx, setSelIdx] = useState(() => {
    const saved = sessionStorage.getItem(`trip:${id}:mediaIdx`)
    return saved ? parseInt(saved, 10) : 0
  })
  const [showDetections, setShowDetections] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [videoMetadataVersion, setVideoMetadataVersion] = useState(0)
  const [currentVideoTime, setCurrentVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [hidden, setHidden] = useState({})
  const [chartTab, setChartTab] = useState('env')
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState(null)
  const [isEvidencePanelOpen, setIsEvidencePanelOpen] = useState(false)
  const [clipStart, setClipStart] = useState(null)
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false)
  const [flash, setFlash] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showDataFiles, setShowDataFiles] = useState(false)
  const [moreMenuPortalPos, setMoreMenuPortalPos] = useState(null)
  const [analyzePopoverOpen, setAnalyzePopoverOpen] = useState(false)
  const [analyzeCloseSignal, setAnalyzeCloseSignal] = useState(0)
  const [showSyncEditor, setShowSyncEditor] = useState(false)
  const [syncEditorPos, setSyncEditorPos] = useState(null)
  const [fileInfoPos, setFileInfoPos] = useState(null)
  const [showFileInfo, setShowFileInfo] = useState(false)
  const [downloadingMedia, setDownloadingMedia] = useState(false)
  const [deletingMedia, setDeletingMedia] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showToolbar, setShowToolbar] = useState(true)
  const [dvlMode, setDvlMode] = useState('path')
  const [showDvlToggle, setShowDvlToggle] = useState(false)
  const [showCenterPauseBtn, setShowCenterPauseBtn] = useState(false)
  const [centerPauseBtnFirstShown, setCenterPauseBtnFirstShown] = useState(false)
  const [activeEvidence, setActiveEvidence] = useState(null)
  const [dims, setDims] = useState(null)
  const [showEvidenceDetections, setShowEvidenceDetections] = useState(false)
  const [evidenceCurrentTime, setEvidenceCurrentTime] = useState(0)
  const [evidenceVideoDuration, setEvidenceVideoDuration] = useState(0)
  const [evidenceShowToolbar, setEvidenceShowToolbar] = useState(true)
  const [evidenceShowCenterPauseBtn, setEvidenceShowCenterPauseBtn] = useState(true)
  const [isEvidenceVideoPlaying, setIsEvidenceVideoPlaying] = useState(false)
  const [evidenceAnalyzing, setEvidenceAnalyzing] = useState(false)
  const [evidenceAnalyzeOpen, setEvidenceAnalyzeOpen] = useState(false)
  const [evidenceAnalyzeModel, setEvidenceAnalyzeModel] = useState('yolov8n')
  const [evidenceAnalyzeConf, setEvidenceAnalyzeConf] = useState(0.30)

  const videoRef = useRef(null)
  const evidenceVideoRef = useRef(null)
  const containerRef = useRef(null)
  const chartContainerRef = useRef(null)
  const exportRef = useRef(null)
  const moreMenuRef = useRef(null)
  const moreMenuPortalRef = useRef(null)
  const syncEditorPortalRef = useRef(null)
  const fileInfoPortalRef = useRef(null)
  const toolbarTimeoutRef = useRef(null)
  const evidenceToolbarTimeoutRef = useRef(null)
  const mobileToolbarTimeoutRef = useRef(null)
  const autoPlayNextRef = useRef(false)
  const [mobileToolbarVisible, setMobileToolbarVisible] = useState(false)
  const [canShowHorizontalPlaylist, setCanShowHorizontalPlaylist] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)

  const [syncTs, setSyncTs] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Brush range for chart — auto-frames to selected video's time window
  const [brushRange, setBrushRange] = useState(null)       // null = full range
  const [brushUserOverride, setBrushUserOverride] = useState(false)

  const [playlistSelectMode, setPlaylistSelectMode] = useState(false)
  const [playlistSelected, setPlaylistSelected] = useState(new Set())
  const [confirmBulkDeletePlaylist, setConfirmBulkDeletePlaylist] = useState(false)

  // Layout mode states
  const [isSonarMode, setIsSonarMode] = useState(false)
  const [statusExpanded, setStatusExpanded] = useState(false)

  const bulkDeletePlaylistMutation = useMutation({
    mutationFn: (ids) => api.delete('/media/bulk', { data: { ids } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['media', id] })
      toast.success(`${res.data?.deleted ?? playlistSelected.size} item(s) deleted`)
      setPlaylistSelected(new Set())
      setPlaylistSelectMode(false)
      setConfirmBulkDeletePlaylist(false)
      setSelIdx(0)
    },
    onError: () => toast.error('Failed to delete items')
  })

  // Use ResizeObserver to detect if Center Column has enough vertical space below the video
  useEffect(() => {
    if (!containerRef.current) return
    const recalc = () => {
      if (window.innerWidth < 1024) {
        setCanShowHorizontalPlaylist(true)
        return
      }
      const c = containerRef.current
      const v = videoRef.current
      if (!c) return
      const cHeight = c.clientHeight
      const cWidth = c.clientWidth

      // Use ACTUAL video aspect ratio when available, fallback to 16:9
      const vw = v?.videoWidth || 0
      const vh = v?.videoHeight || 0
      const videoAspect = (vw > 0 && vh > 0) ? (vw / vh) : (16 / 9)

      // Height the video would take if it fills the container width
      const videoFitHeight = cWidth / videoAspect
      const videoActualHeight = Math.min(cHeight, videoFitHeight)

      // Show horizontal playlist only when there's enough black-bar space for the 110px strip.
      // Using >= 110 ensures the playlist fits as a flow element without squishing the video.
      setCanShowHorizontalPlaylist(cHeight - videoActualHeight >= 110)
    }

    const observer = new ResizeObserver(recalc)
    observer.observe(containerRef.current)

    recalc()
    return () => observer.disconnect()
  }, [containerRef, videoRef, selIdx, videoMetadataVersion])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Mobile (portrait phones) gets the full layout — no sonar-mode toggle needed
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Auto-hide toolbar after 3 seconds without hover/movement in video container
  const handleVideoMouseMove = useCallback(() => {
    setShowToolbar(true)
    if (toolbarTimeoutRef.current) clearTimeout(toolbarTimeoutRef.current)
    toolbarTimeoutRef.current = setTimeout(() => {
      setShowToolbar(false)
    }, 3000)
  }, [])

  // Center pause button: shows on first video load, then shows for 2s when clicked play/pause
  const showCenterPauseBriefly = useCallback(() => {
    if (!centerPauseBtnFirstShown) {
      setCenterPauseBtnFirstShown(true)
      setShowCenterPauseBtn(true)
      return
    }
    setShowCenterPauseBtn(true)
    const timeout = setTimeout(() => setShowCenterPauseBtn(false), 2000)
    return () => clearTimeout(timeout)
  }, [centerPauseBtnFirstShown])

  useEffect(() => {
    return () => {
      if (toolbarTimeoutRef.current) clearTimeout(toolbarTimeoutRef.current)
    }
  }, [])

  const backTo = location.state?.from || '/trips'
  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canUpload = ['admin', 'operator'].includes(user?.role)

  const { data: trip, isLoading, isError } = useQuery({
    queryKey: ['trips', id],
    queryFn: () => api.get(`/trips/${id}`).then(r => r.data),
    staleTime: 30000,
  })
  const { data: rawMediaList = [] } = useQuery({
    queryKey: ['media', id],
    queryFn: () => api.get(`/media/trip/${id}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => query.state.data?.some?.(m => m.analysisStatus === 'pending') ? 4000 : false,
  })
  // Exclude non-media ROV data files (sonar binary, DVL json) from playlist
  const mediaList = rawMediaList.filter(m => {
    const name = (m.originalName || '').toLowerCase()
    const base = name.split('/').pop()
    if (name.endsWith('.sonar')) return false
    if (/^dvl_.*\.json$/.test(base)) return false
    return true
  })
  const { data: snapshots = [] } = useQuery({
    queryKey: ['snapshots', id],
    queryFn: () => api.get(`/snapshots/trip/${id}`).then(r => r.data),
    staleTime: 30000,
    refetchInterval: (query) => query.state.data?.some?.(s => s.analysisStatus === 'pending') ? 4000 : false,
  })



  const hasSensor = (trip?.sensorCount || 0) > 0
  const { data: sensorData } = useQuery({
    queryKey: ['sensor', id],
    queryFn: () => api.get(`/trips/${id}/sensor-data`).then(r => r.data),
    enabled: hasSensor,
    staleTime: 5 * 60 * 1000,
  })

  // Compute whether ANY popup is open (for navigation bar visibility)
  const popupOpen = showMoreMenu || showSyncEditor || showFileInfo || isPlaylistOpen || isEvidencePanelOpen || activeEvidence || analyzePopoverOpen

  const anomalySet = useMemo(() => {
    if (!sensorData?.anomalies) return new Set()
    return new Set(sensorData.anomalies.map(a => `${a.metric}:${a.timestamp}`))
  }, [sensorData])

  const rawChartData = sensorData?.data ?? []
  const stats = sensorData?.stats ?? null
  const anomalies = sensorData?.anomalies ?? []

  // Insert null sentinels at sourceFile boundaries so Recharts shows line breaks between files
  const chartData = useMemo(() => {
    if (rawChartData.length < 2) return rawChartData
    const result = [rawChartData[0]]
    for (let i = 1; i < rawChartData.length; i++) {
      if (rawChartData[i].sourceFile !== rawChartData[i - 1].sourceFile) {
        const t1 = new Date(rawChartData[i - 1].timestamp).getTime()
        const t2 = new Date(rawChartData[i].timestamp).getTime()
        const gap = { timestamp: new Date(Math.round((t1 + t2) / 2)).toISOString(),
          depth: null, temp: null, pressure: null,
          yaw: null, pitch: null, roll: null,
          voltage: null, battery_percent: null, humidity: null, sourceFile: null }
        result.push(gap)
      }
      result.push(rawChartData[i])
    }
    return result
  }, [rawChartData])

  const media = mediaList[selIdx] ?? null
  const { data: mediaUrl, isLoading: isMediaUrlLoading } = useMediaUrl(media?._id)
  const hasNavData = rawChartData.some(d => d.yaw != null || d.pitch != null || d.roll != null)

  // Effect 1: reset override when changing video
  useEffect(() => {
    setBrushUserOverride(false)
  }, [media?._id])

  // Effect 2: auto-frame brush to the selected video's time window.
  // Uses rawChartData (not chartData) to avoid re-triggering on gap-sentinel
  // recalculations. Skips when user has manually dragged the brush.
  useEffect(() => {
    if (brushUserOverride) return
    if (!media?.recordedAt || rawChartData.length === 0) {
      setBrushRange(null)
      return
    }
    const videoStart = new Date(media.recordedAt).getTime()
    const durSec = videoDuration > 0 ? videoDuration : (media?.meta?.duration ?? 120)
    const videoEnd = videoStart + durSec * 1000

    let startIdx = -1, endIdx = -1
    for (let i = 0; i < rawChartData.length; i++) {
      const ts = new Date(rawChartData[i].timestamp).getTime()
      if (startIdx === -1 && ts >= videoStart) startIdx = i
      if (ts <= videoEnd) endIdx = i
    }

    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
      setBrushRange(null)
      return
    }

    // Map rawChartData indices → chartData indices (gap sentinels shift indices)
    // Simple approach: chartData and rawChartData share the same readings in order;
    // sentinels are only inserted between them so rawChartData indices are a subset.
    // Use chartData index of the same object by identity.
    const rawStart = rawChartData[startIdx]
    const rawEnd   = rawChartData[endIdx]
    const cdStartIdx = chartData.findIndex(d => d === rawStart)
    const cdEndIdx   = chartData.findLastIndex(d => d === rawEnd)
    const si = cdStartIdx === -1 ? startIdx : cdStartIdx
    const ei = cdEndIdx   === -1 ? endIdx   : cdEndIdx

    const buf = Math.max(Math.floor((ei - si) * 0.1), 3)
    setBrushRange({
      startIndex: Math.max(0, si - buf),
      endIndex:   Math.min(chartData.length - 1, ei + buf),
    })
  }, [media?._id, media?.recordedAt, rawChartData, videoDuration, brushUserOverride]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasPowerData = rawChartData.some(d => d.voltage != null || d.battery_percent != null || d.humidity != null || d.lightLevel != null || d.powerLevel != null)
  const lastReading = rawChartData[rawChartData.length - 1] ?? null

  // Persist selected media index to sessionStorage so F5 restores same file
  useEffect(() => {
    if (mediaList.length > 0) sessionStorage.setItem(`trip:${id}:mediaIdx`, selIdx)
  }, [selIdx, mediaList.length, id])

  // Clamp saved index if mediaList shrinks (e.g. after delete)
  useEffect(() => {
    if (mediaList.length > 0 && selIdx >= mediaList.length) setSelIdx(mediaList.length - 1)
  }, [mediaList.length])

  // Reset sync state + class filter when switching media
  useEffect(() => {
    setSyncTs(null); setCurrentVideoTime(0); setSelectedClass(null); setVideoDuration(0); setCenterPauseBtnFirstShown(false); setShowCenterPauseBtn(false)
  }, [media?._id])

  // Pause MainMedia when evidence becomes active
  useEffect(() => {
    if (!activeEvidence) return
    const v = videoRef.current
    if (v && !v.paused) v.pause()
  }, [activeEvidence])

  // Sync activeEvidence with updated snapshots data (so analysis status updates)
  useEffect(() => {
    if (!activeEvidence) return
    const updatedEvidence = snapshots.find(s => s._id === activeEvidence._id)
    if (updatedEvidence) {
      setActiveEvidence(updatedEvidence)
    }
  }, [snapshots, activeEvidence])

  // Reset evidence-related states when closing evidence viewer or switching media
  useEffect(() => {
    if (!activeEvidence) {
      setEvidenceCurrentTime(0)
      setEvidenceVideoDuration(0)
      setEvidenceShowToolbar(true)
      setEvidenceShowCenterPauseBtn(false)
      setIsEvidenceVideoPlaying(false)
      setShowEvidenceDetections(false)
    }
  }, [activeEvidence])

  // Cleanup evidence toolbar timeout on unmount
  useEffect(() => {
    return () => {
      if (evidenceToolbarTimeoutRef.current) clearTimeout(evidenceToolbarTimeoutRef.current)
    }
  }, [])

  // Per-frame when ANY label has a frameTime — simple and handles unique-class-per-frame edge case
  const hasPerFrame = useMemo(() => {
    const labs = media?.labels
    if (!labs?.length) return false
    return labs.some(l => l.frameTime != null)
  }, [media?.labels])

  const withFrameLabs = useMemo(() => {
    if (!hasPerFrame || resolveType(media) !== 'video') return []
    const labs = media?.labels || []
    return labs.filter(l => l.frameTime != null)
  }, [media?.labels, hasPerFrame, media])

  const activeLabs = useMemo(() => {
    const labs = media?.labels
    if (!labs?.length) return []
    if (!hasPerFrame || resolveType(media) !== 'video') return labs
    if (!withFrameLabs.length) return labs
    const nearestTime = withFrameLabs.reduce((best, l) =>
      Math.abs(l.frameTime - currentVideoTime) < Math.abs(best - currentVideoTime) ? l.frameTime : best,
      withFrameLabs[0].frameTime)
    // Hide when nearest detection is more than 0.2s away (sparse or end-of-video)
    if (Math.abs(nearestTime - currentVideoTime) > 0.7) return []
    return withFrameLabs.filter(l => l.frameTime === nearestTime)
  }, [media?.labels, hasPerFrame, currentVideoTime, withFrameLabs, media])

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

  // Evidence class groups - same as main video
  const evidenceClassGroups = useMemo(() => {
    if (!activeEvidence?.aiLabels?.length) return []
    const map = {}
    activeEvidence.aiLabels.forEach(l => {
      if (!map[l.name]) map[l.name] = { name: l.name, count: 0, maxConf: 0 }
      map[l.name].count++
      if (l.confidence > map[l.name].maxConf) map[l.name].maxConf = l.confidence
    })
    return Object.values(map).sort((a, b) => b.maxConf - a.maxConf)
  }, [activeEvidence?.aiLabels])

  const handleVideoEnded = useCallback(() => {
    if (!media?.recordedAt) return
    const currentStartMs = new Date(media.recordedAt).getTime()
    const next = mediaList
      .map((m, i) => ({ m, i }))
      .filter(({ m, i }) => i !== selIdx && m.recordedAt && new Date(m.recordedAt).getTime() > currentStartMs)
      .sort((a, b) => new Date(a.m.recordedAt) - new Date(b.m.recordedAt))[0]
    if (next) {
      autoPlayNextRef.current = true
      setSelIdx(next.i)
    }
  }, [media, selIdx, mediaList])

  const handleEvidenceVideoMouseMove = useCallback(() => {
    setEvidenceShowToolbar(true)
    setEvidenceShowCenterPauseBtn(false)
    if (evidenceToolbarTimeoutRef.current) clearTimeout(evidenceToolbarTimeoutRef.current)
    evidenceToolbarTimeoutRef.current = setTimeout(() => {
      setEvidenceShowToolbar(false)
    }, 3000)
  }, [])

  const showEvidenceCenterPauseBriefly = useCallback(() => {
    setEvidenceShowCenterPauseBtn(true)
    setTimeout(() => setEvidenceShowCenterPauseBtn(false), 2000)
  }, [])

  const handleLoadedMetadata = useCallback((e) => {
    setVideoDuration(e.target.duration || 0)
    setCurrentVideoTime(0)
    setVideoMetadataVersion(v => v + 1)
    if (autoPlayNextRef.current) {
      autoPlayNextRef.current = false
      e.target.play().catch(() => {})
    } else {
      setIsVideoPlaying(false)
      showCenterPauseBriefly()
    }
  }, [showCenterPauseBriefly])

  // Update sync timestamp and current time on video timeupdate
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (media?.recordedAt) setSyncTs(new Date(media.recordedAt).getTime() + video.currentTime * 1000)
    setCurrentVideoTime(video.currentTime)
    // Keep duration in sync in case it wasn't available at loadedmetadata time
    if (video.duration && video.duration !== videoDuration) setVideoDuration(video.duration)
  }, [media?.recordedAt, videoDuration])

  // Capture current video frame → POST /snapshots (backend extracts frame from S3 video)
  const capturePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video || !media || resolveType(media) !== 'video') {
      console.warn('capturePhoto: invalid video or media')
      return
    }

    setFlash(true)
    setTimeout(() => setFlash(false), 50)
    setIsCapturingPhoto(true)
    try {
      // Replay video if finished to allow capturing the last frame
      if (video.ended) {
        video.currentTime = Math.max(0, video.duration - 0.5)
        await new Promise(r => setTimeout(r, 100))
      }

      // Try to export canvas, but handle CORS error gracefully
      let dataUrl = null
      try {
        const w = video.videoWidth || 640
        const h = video.videoHeight || 360
        if (w === 0 || h === 0) {
          console.warn('capturePhoto: video dimensions invalid (w=%d, h=%d)', w, h)
        }
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
            const sw = Math.max(w * 0.003, 2)
            const fs = Math.max(h * 0.028, 12)
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
        dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      } catch (corsErr) {
        // Canvas is tainted due to CORS — backend will extract frame instead
        console.warn('Canvas export blocked by CORS (S3 video) — backend will extract frame')
      }

      setIsCapturingPhoto(false)
      api.post('/snapshots', {
        type: 'photo',
        tripId: id,
        parentMediaId: media._id,
        imageTime: video.currentTime,
        dataUrl, // May be null if canvas is tainted
      }).then(res => {
        console.log('capturePhoto: created snapshot', res.data)
        queryClient.invalidateQueries({ queryKey: ['snapshots', id] })
      }).catch(e => {
        console.error('capturePhoto error:', e.response?.data || e.message)
      })
    } catch (e) {
      console.error('capturePhoto error:', e)
      setIsCapturingPhoto(false)
    }
  }, [id, media, showDetections, visibleLabs, videoRef, queryClient])

  // Mark clip start / stop → save clip evidence with thumbnail
  const toggleClipRecording = useCallback(async () => {
    const video = videoRef.current
    if (!video || !media || resolveType(media) !== 'video') return
    if (clipStart === null) {
      setClipStart(video.currentTime)
    } else {
      const startTime = clipStart
      const endTime = video.currentTime
      setClipStart(null)
      if (endTime <= startTime) return

      // Try to export canvas for thumbnail, but handle CORS error gracefully
      let dataUrl = null
      try {
        const w = video.videoWidth || 640, h = video.videoHeight || 360
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      } catch (corsErr) {
        // Canvas is tainted due to CORS — backend will extract thumbnail instead
        console.warn('Canvas export blocked by CORS (S3 video) — backend will extract thumbnail')
      }
      // Fire and forget API call so UI doesn't block
      api.post('/snapshots', {
        type: 'clip',
        tripId: id,
        parentMediaId: media._id,
        startTime, endTime,
        dataUrl, // May be null if canvas is tainted
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['snapshots', id] })
      }).catch(e => console.error('clipRecord:', e))
    }
  }, [id, media, clipStart, videoRef, queryClient])

  // Find closest real (non-sentinel) chart data point to current video sync position
  const syncIdx = useMemo(() => {
    if (syncTs == null || chartData.length === 0) return null
    let closest = 0, minDiff = Infinity
    chartData.forEach((d, i) => {
      if (d.depth == null) return // skip gap sentinels
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

  // Close menu dropdown on outside click (check both button ref and portal ref)
  useEffect(() => {
    if (!showMoreMenu) return
    const handler = (e) => {
      if (!moreMenuRef.current?.contains(e.target) &&
          !moreMenuPortalRef.current?.contains(e.target))
        setShowMoreMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMoreMenu])

  // Close sync-editor / file-info portals on outside click
  useEffect(() => {
    if (!showSyncEditor && !showFileInfo) return
    const handler = (e) => {
      if (!syncEditorPortalRef.current?.contains(e.target) &&
          !fileInfoPortalRef.current?.contains(e.target) &&
          !moreMenuRef.current?.contains(e.target)) {
        setShowSyncEditor(false)
        setShowFileInfo(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSyncEditor, showFileInfo])

  const exportCsv = () => {
    if (!rawChartData.length) return
    const headers = 'timestamp,depth,temp,pressure'
    const rows = rawChartData.map(d =>
      [d.timestamp, d.depth ?? '', d.temp ?? '', d.pressure ?? ''].join(',')
    )
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), {
      href: url, download: `${trip?.title || 'sensor'}-data.csv`,
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
        download: `${trip?.title || 'sensor'}-chart.png`,
      }).click()
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svgEl))}`
  }

  const handleDownloadMedia = async () => {
    if (!media || !mediaUrl || downloadingMedia) return
    setDownloadingMedia(true)
    try {
      const a = document.createElement('a')
      a.href = mediaUrl
      a.download = media.originalName || 'download'
      a.click()
    } finally {
      setDownloadingMedia(false)
      setShowMoreMenu(false)
    }
  }

  const handleDeleteMedia = async (mediaId) => {
    const idToDelete = mediaId || confirmDelete?._id
    if (!idToDelete) return
    setDeletingMedia(true)
    try {
      await api.delete(`/media/${idToDelete}`)
      queryClient.invalidateQueries({ queryKey: ['media', id] })
      setShowMoreMenu(false)
      setConfirmDelete(null)
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeletingMedia(false)
    }
  }

  // Evidence video handlers
  const handleAnalyzeEvidence = useCallback(async () => {
    if (!activeEvidence || !activeEvidence._id || evidenceAnalyzing) return
    setEvidenceAnalyzing(true)
    try {
      await api.post(`/snapshots/${activeEvidence._id}/analyze`, {
        model: evidenceAnalyzeModel,
        confidence: evidenceAnalyzeConf
      })
      queryClient.invalidateQueries({ queryKey: ['snapshots', id] })
      setEvidenceAnalyzeOpen(false)
    } catch (err) {
      console.error('Evidence analysis failed:', err)
    } finally {
      setEvidenceAnalyzing(false)
    }
  }, [activeEvidence, id, queryClient, evidenceAnalyzeModel, evidenceAnalyzeConf])

  const handleDownloadEvidencePhoto = useCallback(async () => {
    if (!activeEvidence || activeEvidence.type !== 'photo') return
    try {
      const result = await api.get(`/snapshots/${activeEvidence._id}/download-url`)
      const { url, filename } = result.data
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), { href: blobUrl, download: filename }).click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }, [activeEvidence])

  const handleDownloadEvidenceClip = useCallback(async () => {
    if (!activeEvidence || activeEvidence.type !== 'clip') return
    try {
      // Use backend endpoint that extracts clip from parent video with FFmpeg
      const url = `/api/v1/snapshots/${activeEvidence._id}/download-clip`
      const a = document.createElement('a')
      a.href = url
      a.download = `clip-${String(activeEvidence._id).slice(-6)}.mp4`
      a.click()
    } catch (err) {
      console.error('Download failed:', err)
    }
  }, [activeEvidence])

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

  if (isError || !trip) throw new Error('Trip not found')

  const { text: sText, cls: sCls } = STATUS[trip.status] || STATUS.pending
  const hasGps = trip.gpsLocation?.lat != null && trip.gpsLocation?.lng != null

  return (
    <div className="-m-4 md:-m-6 min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] flex flex-col overflow-y-auto lg:overflow-hidden bg-background">

      {/* ══════════════════════════════════════════════════════════════ HEADER */}
      <TripHeader
        trip={trip}
        sText={sText}
        sCls={sCls}
        backTo={backTo}
        navigate={navigate}
        hasSensor={hasSensor}
        canUpload={canUpload}
        canEdit={canEdit}
        setShowROVUpload={setShowROVUpload}
        setShowForm={setShowForm}
        showExport={showExport}
        setShowExport={setShowExport}
        exportRef={exportRef}
        exportCsv={exportCsv}
        exportChartPng={exportChartPng}
        chartData={chartData}
      />

      {/* ═══════════════════════════════════════════════════════════ MIDDLE ROW */}
      <div className="flex-none lg:flex-1 lg:min-h-0 flex flex-col lg:flex-row gap-3 p-3 lg:overflow-hidden">

        {/* ─── LEFT COLUMN ─── */}
        <div className="w-full lg:w-[18%] lg:min-w-[180px] lg:max-w-[280px] flex-none flex flex-col gap-3 order-2 lg:order-1 lg:min-h-0">

          {/* Location — square on desktop; hidden when user manually expands Current Status */}
          {!statusExpanded && (
            <div className="h-44 lg:h-auto lg:aspect-square flex-none rounded-xl bg-card border border-border overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 shrink-0">
                <span className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground">Location</span>
                {showDvlToggle && (
                  <div className="flex bg-muted rounded-md overflow-hidden text-[8px] font-semibold">
                    {['map', 'path', 'both'].map(m => (
                      <button key={m} onClick={() => setDvlMode(m)}
                        className={`px-2 py-0.5 capitalize transition-colors ${
                          dvlMode === m
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 relative z-0">
                <TrajectoryViewer
                  tripId={trip._id}
                  hasGps={hasGps}
                  gpsLocation={trip.gpsLocation}
                  currentUTC={media && resolveType(media) === 'video' ? syncTs : null}
                  mode={dvlMode}
                  onModeChange={setDvlMode}
                  onDvlStatus={setShowDvlToggle}
                />
              </div>
            </div>
          )}

          {/* Current Status — auto-adapts: 8 when space, 4 when tight, 2x2 when very tight */}
          {/* Expand button inside hides Location and forces 8 */}
          <div className="flex-1 min-h-0">
            <CurrentStatus
              stats={stats}
              currentReading={currentReading}
              expanded={statusExpanded}
              onToggle={() => setStatusExpanded(v => !v)}
            />
          </div>

          {/* DATA FILES section removed as requested (now in 3-dot menu) */}

        </div>

        {/* ─── CENTER COLUMN ───────────────────────────────────────────────── */}
        {/* Outer wrapper: stacks video + inline chart when isSonarMode */}
        <div className={`flex-none lg:flex-1 lg:min-h-0 order-1 lg:order-2 flex flex-col ${isSonarMode ? 'gap-3' : ''}`}>
        {/* bg-black intentional: video player is always dark regardless of app theme */}
        <div ref={containerRef} className="group flex-1 min-h-0 h-auto bg-black rounded-xl overflow-hidden relative flex flex-col items-center justify-center"
          style={{ isolation: 'isolate' }}
          onClick={handleVideoMouseMove}
          onMouseMove={handleVideoMouseMove}
          onMouseEnter={handleVideoMouseMove}>

          <div className="flex-none lg:flex-1 w-full aspect-video lg:aspect-auto lg:min-h-0 relative flex items-center justify-center">
            <MainMedia media={media} videoRef={videoRef} containerRef={containerRef}
              activeLabs={visibleLabs}
              onEnded={handleVideoEnded} onTimeUpdate={handleTimeUpdate}
              onPlay={() => { setIsVideoPlaying(true); setShowCenterPauseBtn(false) }}
              onPause={() => { setIsVideoPlaying(false); setShowCenterPauseBtn(true) }}
              onLoadedMetadata={handleLoadedMetadata}
              showDetections={showDetections} />

            {/* Evidence viewer overlay — displays on top of MainMedia when active */}
            {activeEvidence && activeEvidence.parentMediaId === media?._id && (
              <EvidenceViewer evidence={activeEvidence} media={media} tripId={id} onClose={() => setActiveEvidence(null)} queryClient={queryClient}
                evidenceShowCenterPauseBtn={evidenceShowCenterPauseBtn} showEvidenceCenterPauseBriefly={showEvidenceCenterPauseBriefly} />
            )}

            {/* Flash Effect Overlay */}
            <div className={`absolute inset-0 bg-white z-[9999] pointer-events-none transition-opacity duration-150 ease-out
                          ${flash ? 'opacity-80' : 'opacity-0'}`} />

            {/* OLD IMPLEMENTATION REMOVED - replaced with EvidenceViewer component */}
            {false && activeEvidence && activeEvidence.parentMediaId === media?._id && (
              <div className="absolute inset-0 z-30 rounded-xl overflow-hidden flex flex-col">
                {/* Header with action buttons */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0 bg-slate-950/90">
                  {/* Left: Back + Timestamp */}
                  <button onClick={() => { setActiveEvidence(null); setShowEvidenceDetections(false) }}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-white/80 hover:text-white transition-colors">
                    <ArrowLeft size={13} />
                    <span>Back</span>
                    <span className="text-white/40 mx-1">|</span>
                    <span className="text-white/70 font-mono text-[10px]">
                      {activeEvidence.type === 'clip'
                        ? `${fmtVideoTime(activeEvidence.startTime)} → ${fmtVideoTime(activeEvidence.endTime)}`
                        : fmtVideoTime(activeEvidence.imageTime)
                      }
                    </span>
                  </button>

                  {/* Right: Action buttons */}
                  <div className="flex items-center gap-2">
                    {/* Show/Hide Detections */}
                    {activeEvidence.aiLabels?.length > 0 && (
                      <button onClick={() => setShowEvidenceDetections(v => !v)}
                        title={showEvidenceDetections ? 'Hide detections' : 'Show detections'}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold transition-colors ${showEvidenceDetections
                          ? 'bg-blue-500/90 text-white'
                          : 'bg-white/10 text-white/70 hover:text-white'
                          }`}>
                        {showEvidenceDetections ? <EyeOff size={11} /> : <Eye size={11} />}
                        <span className="hidden sm:inline">{showEvidenceDetections ? 'Hide' : 'Show'}</span>
                      </button>
                    )}

                    {/* Analyze button with popover */}
                    {canUpload && (
                      <div className="relative">
                        <button onClick={() => setEvidenceAnalyzeOpen(!evidenceAnalyzeOpen)}
                          disabled={evidenceAnalyzing}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold
                                   transition-colors ${evidenceAnalyzing
                              ? 'bg-blue-500/60 text-white'
                              : evidenceAnalyzeOpen
                                ? 'bg-blue-500/90 text-white'
                                : 'bg-white/10 text-white/70 hover:text-white hover:bg-white/15'
                            }`}>
                          {evidenceAnalyzing ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          <span className="hidden sm:inline">{evidenceAnalyzing ? 'Analyzing' : 'Analyze'}</span>
                        </button>

                        {/* Analyze popover */}
                        {evidenceAnalyzeOpen && (
                          <div className="absolute right-0 top-full mt-2 w-60 bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-3 z-50 text-white text-[10px]">
                            <div className="space-y-2">
                              {/* Model selector */}
                              <div>
                                <p className="font-bold text-white/70 mb-1.5">Model</p>
                                <select value={evidenceAnalyzeModel} onChange={e => setEvidenceAnalyzeModel(e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-[9px] focus:outline-none">
                                  <option value="yolov8n">YOLOv8n General</option>
                                  <option value="fish1">Fish Detector</option>
                                  <option value="trash">Trash Detector</option>
                                </select>
                              </div>

                              {/* Confidence slider */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <p className="font-bold text-white/70">Confidence</p>
                                  <span className="font-mono">{(evidenceAnalyzeConf * 100).toFixed(0)}%</span>
                                </div>
                                <input type="range" min="0.1" max="0.9" step="0.05"
                                  value={evidenceAnalyzeConf}
                                  onChange={e => setEvidenceAnalyzeConf(parseFloat(e.target.value))}
                                  className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer" />
                              </div>

                              {/* Run button */}
                              <button onClick={handleAnalyzeEvidence} disabled={evidenceAnalyzing}
                                className="w-full mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white font-bold text-[10px] transition-colors">
                                {evidenceAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Download buttons */}
                    {activeEvidence.type === 'photo' && (
                      <button onClick={handleDownloadEvidencePhoto}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold
                                 bg-white/10 text-white/70 hover:text-white hover:bg-white/15 transition-colors">
                        <Download size={11} />
                        <span className="hidden sm:inline">PNG</span>
                      </button>
                    )}

                    {activeEvidence.type === 'clip' && (
                      <button onClick={handleDownloadEvidenceClip}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold
                                 bg-white/10 text-white/70 hover:text-white hover:bg-white/15 transition-colors">
                        <Download size={11} />
                        <span className="hidden sm:inline">MP4</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 flex items-center justify-center relative group"
                  onMouseMove={handleEvidenceVideoMouseMove}
                  onMouseEnter={handleEvidenceVideoMouseMove}>
                  {isMediaUrlLoading ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                  ) : activeEvidence.type === 'clip' && media && mediaUrl ? (
                    <div className="relative w-full h-full cursor-pointer"
                      onClick={() => {
                        const v = evidenceVideoRef.current
                        if (!v) return
                        v.paused ? v.play().catch(() => { }) : v.pause()
                      }}>
                      <video ref={evidenceVideoRef} src={mediaUrl}
                        className="w-full h-full object-contain"
                        onLoadedMetadata={e => {
                          const { startTime = 0, endTime } = activeEvidence
                          setDims({ w: e.target.videoWidth, h: e.target.videoHeight })
                          const clipDuration = (endTime || e.target.duration) - startTime
                          setEvidenceVideoDuration(clipDuration)
                          e.target.currentTime = startTime
                        }}
                        onTimeUpdate={handleEvidenceTimeUpdate}
                        onPlay={() => setIsEvidenceVideoPlaying(true)}
                        onPause={() => setIsEvidenceVideoPlaying(false)} />
                      {showEvidenceDetections && <DetectionSVG labels={activeEvidence.aiLabels || []} dims={dims} />}

                      {/* Evidence video center pause button */}
                      {evidenceShowCenterPauseBtn && (
                        <button onClick={e => {
                          e.stopPropagation()
                          const v = evidenceVideoRef.current
                          if (!v) return
                          if (v.paused) { v.play().catch(() => { }) }
                          else { v.pause(); showEvidenceCenterPauseBriefly() }
                        }}
                          className="absolute z-30 p-4 rounded-full bg-white/20 hover:bg-white/30
                                   transition-opacity opacity-100
                                   backdrop-blur-sm border border-white/20">
                          {isEvidenceVideoPlaying ? <Pause size={24} className="text-white" /> : <Play size={24} className="text-white" />}
                        </button>
                      )}

                      {/* Evidence video control bar — bottom gradient overlay */}
                      {activeEvidence.type === 'clip' && (
                        <div className={`absolute bottom-0 inset-x-0 z-20 flex flex-col gap-2
                                      px-3 py-2.5
                                      bg-gradient-to-t from-black/80 to-transparent
                                      transition-opacity duration-200 ${evidenceShowToolbar ? 'opacity-100' : 'opacity-0'}`}>
                          {/* Timeline */}
                          <div className="flex items-center gap-2 text-[10px] text-white/70">
                            <span className="font-mono min-w-[32px]">{fmtVideoTime(evidenceCurrentTime)}</span>
                            <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden group/timeline">
                              <div className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${evidenceVideoDuration ? (evidenceCurrentTime / evidenceVideoDuration) * 100 : 0}%` }} />
                            </div>
                            <span className="font-mono">{fmtVideoTime(evidenceVideoDuration)}</span>
                          </div>

                          {/* Control buttons */}
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={e => {
                              e.stopPropagation()
                              const v = evidenceVideoRef.current
                              if (!v) return
                              if (v.paused) { v.play().catch(() => { }) }
                              else { v.pause(); showEvidenceCenterPauseBriefly() }
                            }}
                              className="p-1.5 text-white/70 hover:text-white rounded transition-colors">
                              {isEvidenceVideoPlaying ? <Pause size={13} /> : <Play size={13} />}
                            </button>
                            <button onClick={e => {
                              e.stopPropagation()
                              const v = evidenceVideoRef.current
                              if (v) v.muted = !v.muted
                            }}
                              className="p-1.5 text-white/70 hover:text-white rounded transition-colors">
                              <Volume2 size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activeEvidence.type === 'photo' ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img src={activeEvidence.imageUrl || activeEvidence.thumbnailUrl} alt=""
                        className="max-w-full max-h-full object-contain"
                        onLoad={e => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
                      {showEvidenceDetections && <DetectionSVG labels={activeEvidence.aiLabels || []} dims={dims} />}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full h-full">
                      <p className="text-white/40">Loading...</p>
                    </div>
                  )}
                </div>

                {/* AI labels footer - class groups like main video */}
                {evidenceClassGroups.length > 0 && (
                  <div className="px-3 py-2 border-t border-white/10 bg-slate-950/90 shrink-0">
                    <div className="flex flex-wrap gap-1.5">
                      {evidenceClassGroups.map(g => {
                        const isHigh = g.maxConf > 0.8
                        return (
                          <span key={g.name}
                            className={`text-[10px] font-bold px-2 py-1 rounded leading-none
                          ${isHigh ? 'bg-blue-500/90 text-white' : 'bg-amber-500/90 text-white'}`}>
                            {g.name} ×{g.count} {Math.round(g.maxConf * 100)}%
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Center pause button — shows for 2s when clicked during playback */}
            {media && resolveType(media) === 'video' && showCenterPauseBtn && (
              <button onClick={() => {
                const v = videoRef.current
                if (!v) return
                if (v.paused) { v.play().catch(() => { }) }
                else { v.pause(); showCenterPauseBriefly() }
              }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 p-4 rounded-full
                         bg-white/20 hover:bg-white/30 transition-opacity opacity-100
                         backdrop-blur-sm border border-white/20">
                {isVideoPlaying ? <Pause size={24} className="text-white" /> : <Play size={24} className="text-white" />}
              </button>
            )}

            {/* Top gradient overlay — hidden until hover, then reveals filename + buttons */}
            {media && !activeEvidence && (
              <div className={`absolute top-0 inset-x-0 z-20 flex items-center gap-2
                            px-3 py-2.5
                            bg-gradient-to-b from-black/60 to-transparent
                            transition-opacity duration-200 ${popupOpen || showToolbar ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <span className="text-[11px] text-white/55 truncate flex-1 min-w-0 pointer-events-none">
                  {media.originalName}
                </span>
                <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
                  {/* Group 1: Detect + Analyze */}
                  <div className="flex items-center gap-0.5 bg-slate-950/80 border border-white/15 rounded-full px-1.5 py-1">
                    {media?.analysisStatus === 'done' && (
                      <button onClick={() => setShowDetections(v => !v)}
                        title={showDetections ? 'Hide detections' : 'Show detections'}
                        className={`flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[10px] font-bold transition-colors select-none ${showDetections
                          ? 'bg-blue-500/90 text-white'
                          : 'text-white/80 hover:text-white'
                          }`}>
                        {showDetections ? <EyeOff size={10} /> : <Eye size={10} />}
                        <span className="hidden xl:inline">Detect</span>
                      </button>
                    )}
                    <AIAnalyzePopover media={media} tripId={id} canUse={canUpload}
                      portalTarget={isFullscreen ? containerRef.current : document.body}
                      closeSignal={analyzeCloseSignal}
                      onWillOpen={() => { setShowMoreMenu(false); setShowSyncEditor(false); setShowFileInfo(false) }}
                      onOpenChange={setAnalyzePopoverOpen} />
                  </div>

                  {/* Group 2: Photo + Clip + Evidence (video only) */}
                  {canUpload && media && resolveType(media) === 'video' && (
                    <div className="flex items-center gap-0.5 bg-slate-950/80 border border-white/15 rounded-full px-1.5 py-1">
                      <button onClick={capturePhoto} disabled={isCapturingPhoto}
                        title="Capture photo"
                        className={`p-1 rounded-full transition-colors ${isCapturingPhoto
                          ? 'text-white/40 cursor-wait'
                          : 'text-white/80 hover:text-white'
                          }`}>
                        {isCapturingPhoto ? <Loader size={10} className="animate-spin" /> : <Camera size={10} />}
                      </button>
                      <button onClick={toggleClipRecording}
                        title={clipStart === null ? 'Record clip' : 'Stop recording'}
                        className={`flex items-center gap-0.5 px-1 py-1 rounded-full text-[10px] font-bold transition-colors ${clipStart !== null
                          ? 'bg-red-500/90 text-white animate-pulse'
                          : 'text-white/80 hover:text-white'
                          }`}>
                        {clipStart !== null ? (
                          <><Square size={9} fill="currentColor" /><span className="text-[9px]">{fmtVideoTime(Math.max(0, currentVideoTime - clipStart))}</span></>
                        ) : (
                          <Clapperboard size={10} />
                        )}
                      </button>
                      <button onClick={() => { const next = !isEvidencePanelOpen; setIsEvidencePanelOpen(next); if (next) { setIsPlaylistOpen(false); setShowMoreMenu(false); setAnalyzeCloseSignal(v => v + 1) } }}
                        title={`Evidence (${snapshots.length})`}
                        className={`flex items-center gap-0.5 px-1 py-1 rounded-full text-[10px] font-bold transition-colors ${isEvidencePanelOpen
                          ? 'bg-emerald-500/90 text-white'
                          : 'text-white/80 hover:text-white'
                          }`}>
                        <Images size={10} />
                        {snapshots.length > 0 && <span className="text-[9px]">{snapshots.length}</span>}
                      </button>
                    </div>
                  )}

                  {/* Group 3: Playlist */}
                  {mediaList.length > 1 && (
                    <button onClick={() => { const next = !isPlaylistOpen; setIsPlaylistOpen(next); if (next) { setIsEvidencePanelOpen(false); setShowMoreMenu(false); setAnalyzeCloseSignal(v => v + 1) } }}
                      title={isPlaylistOpen ? 'Hide playlist' : `Playlist (${mediaList.length})`}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] font-bold
                               transition-colors select-none backdrop-blur-sm border
                               ${isPlaylistOpen
                          ? 'bg-slate-600/80 border-slate-500 text-white'
                          : 'bg-black/50 border-white/15 text-white/80 hover:text-white'}`}>
                      <Film size={11} />
                      <span className="hidden xl:inline">{isPlaylistOpen ? 'Hide' : mediaList.length}</span>
                    </button>
                  )}

                  {/* Group 4: Menu */}
                  <div ref={moreMenuRef} className="relative">
                    <button onClick={() => {
                      if (!showMoreMenu) {
                        const rect = moreMenuRef.current?.getBoundingClientRect()
                        if (rect) {
                          const w = Math.min(160, window.innerWidth - 16)
                          setMoreMenuPortalPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8)) })
                        }
                        setAnalyzeCloseSignal(v => v + 1)
                      }
                      setShowMoreMenu(v => !v)
                    }}
                      title="More options"
                      className={`flex items-center justify-center p-1.5 rounded-full text-[11px] font-bold
                               transition-colors select-none backdrop-blur-sm border
                               ${showMoreMenu
                          ? 'bg-slate-600/80 border-slate-500 text-white'
                          : 'bg-black/50 border-white/15 text-white/80 hover:text-white'}`}>
                      <MoreVertical size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE SYNC badge — rests at top-3, slides down to top-10 on toolbar hover */}
            {syncTs != null && (
              <div className={`absolute left-3 z-30 pointer-events-none
                            transition-[top] duration-200 ease-out
                            flex items-center gap-1.5 px-2.5 py-1 rounded-full select-none
                            bg-red-500/90 backdrop-blur-sm text-white text-[10px] font-bold
                            ${showToolbar ? 'top-10' : 'top-3'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                SYNC
              </div>
            )}

            {/* YOLOv8 class badges — grouped by class, always visible, click to filter bbox */}
            {showDetections && classGroups.length > 0 && !activeEvidence && (
              <div className={`absolute left-0 right-0 z-50
                            opacity-100
                            transition-[bottom] duration-200 ease-out
                            px-3 flex flex-wrap gap-1.5 pointer-events-none
                            ${showToolbar ? 'bottom-14' : 'bottom-2'}`}>
                {selectedClass && (
                  <button onClick={() => setSelectedClass(null)}
                    className="pointer-events-auto px-2 py-1 text-[10px] font-bold rounded-full
                             bg-white/15 border border-white/25 text-white/70
                             hover:bg-white/25 hover:text-white transition-all select-none">
                    ✕ all
                  </button>
                )}
                {classGroups.map(g => {
                  const isSelected = selectedClass === g.name
                  const isOther = selectedClass !== null && !isSelected
                  const isHigh = g.maxConf > 0.8
                  return (
                    <button key={g.name}
                      onClick={() => setSelectedClass(prev => prev === g.name ? null : g.name)}
                      title={`Click to ${isSelected ? 'show all' : 'filter to ' + g.name + ' only'}`}
                      className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1
                                text-[10px] font-bold rounded-full leading-none select-none
                                backdrop-blur-sm border transition-all duration-150
                                cursor-pointer hover:scale-105 active:scale-95 ${isSelected
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
              <RetryAnalysisButton mediaId={media._id} tripId={id}
                queryClient={queryClient} />
            )}

            {/* Evidence panel ─ slides in from right, independent of playlist */}
            {!canShowHorizontalPlaylist && (
              <EvidencePanel
                snapshots={snapshots}
                isOpen={isEvidencePanelOpen}
                tripId={id}
                canEdit={canUpload}
                videoRef={videoRef}
                queryClient={queryClient}
                currentMediaId={media?._id}
                onSelectEvidence={setActiveEvidence}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
              />
            )}

            {/* Playlist overlay ─ slides in from right as an absolute panel */}
            {!canShowHorizontalPlaylist && (
              <div className={`absolute top-0 right-0 bottom-0 z-10 w-44
                           bg-slate-950/95 border-l border-white/10
                           overflow-y-auto flex flex-col
                           transition-transform duration-200 ease-out
                           ${isPlaylistOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="pt-[52px] px-3 pb-2.5 border-b border-white/10 shrink-0 sticky top-0 bg-slate-950/90 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Playlist</p>
                    {canUpload && mediaList.length > 0 && !playlistSelectMode && (
                      <button onClick={() => setPlaylistSelectMode(true)} className="text-[9px] font-bold text-white/50 hover:text-white uppercase transition-colors">
                        Select
                      </button>
                    )}
                  </div>
                  {!playlistSelectMode ? (
                    <p className="text-[8px] text-white/30">
                      {mediaList.length} item{mediaList.length !== 1 ? 's' : ''}
                    </p>
                  ) : (
                    <div className="flex items-center justify-between mt-1">
                      <button onClick={() => setPlaylistSelected(playlistSelected.size === mediaList.length ? new Set() : new Set(mediaList.map(m => m._id)))} className="text-[9px] text-white/70 hover:text-white px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors">
                        {playlistSelected.size === mediaList.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <div className="flex items-center gap-1">
                        {playlistSelected.size > 0 && (
                          <button onClick={() => setConfirmBulkDeletePlaylist(true)} className="p-1 rounded bg-red-500/80 hover:bg-red-500 text-white transition-colors" title="Delete selected">
                            <Trash2 size={10} />
                          </button>
                        )}
                        <button onClick={() => { setPlaylistSelectMode(false); setPlaylistSelected(new Set()) }} className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors" title="Cancel">
                          <X size={10} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-2 pb-16 flex flex-col gap-2">
                  {mediaList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10">
                      <File size={20} className="text-slate-600" />
                      <p className="text-[10px] text-slate-500 text-center">No files uploaded</p>
                    </div>
                  ) : (
                    mediaList.map((m, i) => (
                      <ThumbVertical
                        key={m._id}
                        media={m}
                        active={i === selIdx}
                        onClick={() => setSelIdx(i)}
                        label={`${resolveType(m) === 'video' ? 'Video' : 'Photo'} ${i + 1}`}
                        canEdit={canUpload}
                        deleting={false}
                        onDelete={() => setConfirmDelete(m)}
                        selectMode={playlistSelectMode}
                        selected={playlistSelected.has(m._id)}
                        onSelect={() => setPlaylistSelected(prev => { const next = new Set(prev); next.has(m._id) ? next.delete(m._id) : next.add(m._id); return next })}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Custom video controls — keep visible when popup open */}
            {media && resolveType(media) === 'video' && !activeEvidence && (
              <CustomVideoControls
                videoRef={videoRef}
                isPlaying={isVideoPlaying}
                mediaId={media._id}
                containerRef={containerRef}
                currentTime={currentVideoTime}
                duration={videoDuration}
                isFullscreen={isFullscreen}
                popupOpen={popupOpen}
                showToolbar={showToolbar}
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

          </div> {/* END of flex-1 MainMedia wrapper */}

          {/* Horizontal Evidence (Bottom of Center Column) */}
          {canShowHorizontalPlaylist && (
            <EvidencePanel
              snapshots={snapshots}
              isOpen={isEvidencePanelOpen}
              tripId={id}
              canEdit={canUpload}
              videoRef={videoRef}
              queryClient={queryClient}
              currentMediaId={media?._id}
              onSelectEvidence={setActiveEvidence}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              isHorizontal={true}
            />
          ) /* END Horizontal Evidence */}

          {/* Horizontal Playlist (Bottom of Center Column) */}
          {/* flex-none keeps it in flow so it never overlaps the video controls above */}
          {canShowHorizontalPlaylist && isPlaylistOpen && mediaList.length > 1 && (
            <div className="flex-none w-full h-[110px] bg-slate-950/95 flex items-center gap-2 px-3 overflow-x-auto overflow-y-hidden border-t border-white/10">
              <div className="shrink-0 flex flex-col justify-center px-3 border-r border-white/10 mr-1 h-[80%] min-w-[80px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Playlist</p>
                
                {!playlistSelectMode ? (
                  <>
                    <p className="text-[9px] text-white/30 mb-1">{mediaList.length} item{mediaList.length !== 1 ? 's' : ''}</p>
                    {canUpload && mediaList.length > 0 && (
                      <button onClick={() => setPlaylistSelectMode(true)} className="text-[9px] font-bold text-white/50 hover:text-white uppercase transition-colors self-start">
                        Select
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <button onClick={() => setPlaylistSelected(playlistSelected.size === mediaList.length ? new Set() : new Set(mediaList.map(m => m._id)))} className="text-[9px] text-white/70 hover:text-white px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors self-start">
                      {playlistSelected.size === mediaList.length ? 'Deselect' : 'Select All'}
                    </button>
                    <div className="flex items-center gap-1">
                      {playlistSelected.size > 0 && (
                        <button onClick={() => setConfirmBulkDeletePlaylist(true)} className="p-1 rounded bg-red-500/80 hover:bg-red-500 text-white transition-colors" title="Delete selected">
                          <Trash2 size={10} />
                        </button>
                      )}
                      <button onClick={() => { setPlaylistSelectMode(false); setPlaylistSelected(new Set()) }} className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors" title="Cancel">
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {mediaList.map((m, i) => (
                <div key={m._id} className="shrink-0 w-32">
                  <ThumbVertical
                    media={m}
                    active={i === selIdx}
                    onClick={(e) => { e.stopPropagation(); setSelIdx(i) }}
                    label={`${resolveType(m) === 'video' ? 'Video' : 'Photo'} ${i + 1}`}
                    canEdit={canUpload}
                    deleting={false}
                    onDelete={() => setConfirmDelete(m)}
                    selectMode={playlistSelectMode}
                    selected={playlistSelected.has(m._id)}
                    onSelect={() => setPlaylistSelected(prev => { const next = new Set(prev); next.has(m._id) ? next.delete(m._id) : next.add(m._id); return next })}
                  />
                </div>
              ))}
            </div>
          )}

          {confirmBulkDeletePlaylist && (
            <ConfirmDialog
              title="Delete Playlist Items"
              message={`Are you sure you want to delete ${playlistSelected.size} item(s)?`}
              loading={bulkDeletePlaylistMutation.isPending}
              onConfirm={() => bulkDeletePlaylistMutation.mutate([...playlistSelected])}
              onCancel={() => setConfirmBulkDeletePlaylist(false)}
            />
          )}

        </div>

        {/* inline chart appears inside center wrapper when in sonar mode (desktop only — mobile always shows full layout below) */}
        {isSonarMode && !isMobile && (
          <BottomChart
            chartTab={chartTab} setChartTab={setChartTab}
            hidden={hidden} setHidden={setHidden}
            hasNavData={hasNavData} hasPowerData={hasPowerData}
            chartData={chartData} syncIdx={syncIdx} anomalySet={anomalySet}
            isDark={isDark} hasSensor={hasSensor}
            brushRange={brushRange}
            onBrushChange={(range) => { setBrushUserOverride(true); setBrushRange(range) }}
          />
        )}
        </div>{/* ─── end CENTER COLUMN WRAPPER ─── */}

        {/* ─── RIGHT COLUMN ─── */}
        <div className="w-full lg:w-[18%] lg:min-w-[180px] lg:max-w-[280px] flex-none lg:min-h-0 flex flex-col gap-3 order-3">

          {/* Navigation gauges */}
          <div className="flex-none rounded-xl bg-card border border-border p-3">
            <SectionLabel>Navigation</SectionLabel>
            <div className="flex items-start justify-around gap-2 pt-1 w-full">
              <ArtificialHorizon
                pitch={currentReading?.pitch ?? 0}
                roll={currentReading?.roll ?? 0}
                active={currentReading != null} />
              <CompassRose
                yaw={currentReading?.yaw ?? 0}
                active={currentReading != null} />
            </div>
          </div>

          {/* Sonar — always shown on mobile (full layout, no toggle needed); desktop only in sonar mode */}
          {(isSonarMode || isMobile) && (
            <div className="flex-none h-56 rounded-xl bg-card border border-border overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Radio size={9} /> Sonar
                </span>
                {!isMobile && (
                  <button onClick={() => setIsSonarMode(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Exit sonar mode">
                    <X size={11} />
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <SonarViewer tripId={trip._id} currentUTC={syncTs} />
              </div>
            </div>
          )}

          {/* Alerts — compact in sonar mode (height constrained), full otherwise */}
          <AlertsPanel anomalies={anomalies} hasSensor={hasSensor} />

        </div>
      </div>

      {/* ─── BOTTOM CHART — normal mode, always shown on mobile (full layout) ── */}
      {(!isSonarMode || isMobile) && (
        <BottomChart
          chartTab={chartTab} setChartTab={setChartTab}
          hidden={hidden} setHidden={setHidden}
          hasNavData={hasNavData} hasPowerData={hasPowerData}
          chartData={chartData} syncIdx={syncIdx} anomalySet={anomalySet}
          isDark={isDark} hasSensor={hasSensor}
          brushRange={brushRange}
          onBrushChange={(range) => { setBrushUserOverride(true); setBrushRange(range) }}
          extraRight={
            !isMobile && (
              <button
                onClick={() => setIsSonarMode(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold
                           bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground
                           border border-border transition-colors">
                <Radio size={10} /> Sonar
              </button>
            )
          }
        />
      )}

      {/* ── video overlay portals (fixed — escape overflow-hidden + stacking context) ── */}
      {showMoreMenu && moreMenuPortalPos && createPortal(
        <div ref={moreMenuPortalRef}
          style={{ top: moreMenuPortalPos.top, left: moreMenuPortalPos.left }}
          className="fixed z-[9999] w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
          <button onClick={handleDownloadMedia} disabled={downloadingMedia}
            className="w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-800
                       transition-colors disabled:opacity-50 flex items-center gap-2 text-left">
            {downloadingMedia ? <Loader size={10} className="animate-spin" /> : <Download size={10} />}
            Download
          </button>
          {media && resolveType(media) === 'video' && canUpload && (
            <button onClick={() => {
              const rect = moreMenuRef.current?.getBoundingClientRect()
              if (rect) {
                const w = Math.min(192, window.innerWidth - 16)
                setSyncEditorPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8)) })
              }
              setShowSyncEditor(true); setShowFileInfo(false); setShowMoreMenu(false); setIsPlaylistOpen(false); setIsEvidencePanelOpen(false); setAnalyzeCloseSignal(v => v + 1)
            }}
              className="w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-800
                         transition-colors flex items-center gap-2 text-left">
              <Clock size={10} />
              Sync time
            </button>
          )}
          <button onClick={() => {
            const rect = moreMenuRef.current?.getBoundingClientRect()
            if (rect) {
              const w = Math.min(224, window.innerWidth - 16)
              setFileInfoPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8)) })
            }
            setShowFileInfo(true); setShowSyncEditor(false); setShowMoreMenu(false); setIsPlaylistOpen(false); setIsEvidencePanelOpen(false); setAnalyzeCloseSignal(v => v + 1)
          }}
            className="w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-800
                       transition-colors flex items-center gap-2 text-left">
            <Info size={10} />
            File info
          </button>
          <div className="border-t border-slate-700" />
          <button onClick={() => { setShowDataFiles(true); setShowMoreMenu(false) }}
            className="w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-800
                       transition-colors flex items-center gap-2 text-left">
            <Activity size={10} />
            Data files
          </button>
          {canUpload && media && (
            <>
              <div className="border-t border-slate-700" />
              <button onClick={() => { setConfirmDelete(media); setShowMoreMenu(false) }}
                className="w-full px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/20
                           transition-colors flex items-center gap-2 text-left">
                <Trash2 size={10} />
                Delete
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {showSyncEditor && syncEditorPos && media && resolveType(media) === 'video' && createPortal(
        <div ref={syncEditorPortalRef}
          style={{ top: syncEditorPos.top, left: syncEditorPos.left }}
          className="fixed z-[9999] bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-2 w-48 max-w-[calc(100vw-16px)]">
          <RecordedAtEditor media={media} tripId={id}
            onCancel={() => setShowSyncEditor(false)}
            onDone={() => setShowSyncEditor(false)}
          />
        </div>,
        document.body
      )}

      {showFileInfo && fileInfoPos && media && createPortal(
        <div ref={fileInfoPortalRef}
          style={{ top: fileInfoPos.top, left: fileInfoPos.left }}
          className="fixed z-[9999] bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-3 w-56 max-w-[calc(100vw-16px)] text-[11px] space-y-2">
          <div>
            <p className="text-white/50 uppercase text-[9px] tracking-wider">Name</p>
            <p className="text-white truncate">{media.originalName}</p>
          </div>
          <div>
            <p className="text-white/50 uppercase text-[9px] tracking-wider">Type</p>
            <p className="text-white">{media.type || 'unknown'}</p>
          </div>
          <div>
            <p className="text-white/50 uppercase text-[9px] tracking-wider">Size</p>
            <p className="text-white">{(media.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          {media.duration && (
            <div>
              <p className="text-white/50 uppercase text-[9px] tracking-wider">Duration</p>
              <p className="text-white">{fmtVideoTime(media.duration)}</p>
            </div>
          )}
          <div>
            <p className="text-white/50 uppercase text-[9px] tracking-wider">Uploaded</p>
            <p className="text-white">{new Date(media.createdAt).toLocaleString()}</p>
          </div>
          <button onClick={() => setShowFileInfo(false)}
            className="w-full mt-2 px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-white">
            Close
          </button>
        </div>,
        document.body
      )}

      {/* ── modals ── */}
      {showDataFiles && trip && (
        <DataFilesModal
          tripId={id}
          tripTitle={trip.title}
          canEdit={canUpload}
          onClose={() => setShowDataFiles(false)}
        />
      )}
      {showForm && (
        <TripForm projectId={trip.project?._id} tripData={trip} onClose={() => setShowForm(false)} />
      )}
      {showROVUpload && (
        <ROVDataUpload trip={trip} onClose={() => setShowROVUpload(false)} />
      )}
      {confirmDelete && !['photo', 'clip'].includes(confirmDelete.type) && (
        <ConfirmDialog
          title="Delete Media"
          message={`Are you sure you want to delete "${confirmDelete.originalName}"?`}
          loading={deletingMedia}
          onConfirm={() => handleDeleteMedia(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)} />
      )}

      {confirmDelete && ['photo', 'clip'].includes(confirmDelete.type) && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.type === 'clip' ? 'Clip' : 'Photo'}`}
          message={`Are you sure you want to delete this ${confirmDelete.type === 'clip' ? 'clip' : 'photo'}?`}
          loading={deletingMedia}
          onConfirm={async () => {
            setDeletingMedia(true)
            try {
              await api.delete(`/snapshots/${confirmDelete._id}`)
              queryClient.invalidateQueries({ queryKey: ['snapshots', id] })
              setConfirmDelete(null)
            } catch {
              // error
            } finally {
              setDeletingMedia(false)
            }
          }}
          onCancel={() => setConfirmDelete(null)} />
      )}

    </div>
  )
}

// force vite hmr
