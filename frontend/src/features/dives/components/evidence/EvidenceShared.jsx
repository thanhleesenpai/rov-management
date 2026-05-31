import { useMediaUrl, resolveType, DetectionSVG } from '../media/MediaShared'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  File, FileText, CheckCircle2, AlertTriangle, X, Play, Pause, 
  Volume2, VolumeX, Maximize2, Minimize2, Loader, 
  Clock, Info, Sparkles, ArrowLeft, Download, Trash2, Camera, Clapperboard, Square, Images, Eye, EyeOff
} from 'lucide-react'
import api from '@/lib/axios'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

// ─── Evidence video controls ─────────────────────────────────────────────────

export function EvidenceVideoControls({ videoRef, isPlaying, currentTime, duration, showToolbar, onMouseMove, startTime, endTime }) {
  const [muted, setMuted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragPct, setDragPct] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const progressRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onVol = () => setMuted(v.muted)
    v.addEventListener('volumechange', onVol)
    setMuted(v.muted)
    return () => v.removeEventListener('volumechange', onVol)
  }, [])

  const fmt = (s) => {
    if (s === null || s === undefined || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const videoPct = duration > 0 ? (currentTime / duration) * 100 : 0
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
    v.currentTime = startTime + (p / 100) * (endTime - startTime)
  }

  const togglePlay = (e) => {
    e.stopPropagation()
    const v = videoRef.current; if (!v) return
    if (isPlaying) {
      v.pause()
    } else {
      // If at end of clip, reset to start before playing
      if (v.currentTime >= (endTime || v.duration) - 0.1) v.currentTime = startTime || 0
      v.play().catch(() => {})
    }
  }

  const handleProgressMouseDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    setIsDragging(true)
    applySeek(e.clientX)
    const onMove = (ev) => applySeek(ev.clientX)
    const onUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const toggleMute = (e) => {
    e.stopPropagation()
    const v = videoRef.current; if (!v) return
    v.muted = !v.muted
  }

  const handleFullscreen = (e) => {
    e.stopPropagation()
    const container = containerRef.current?.parentElement?.parentElement
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
      setIsFullscreen(false)
    } else {
      container.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    }
  }

  // Listen for fullscreen changes
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div ref={containerRef} className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-200
                    px-3 pt-8 pb-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent
                    ${showToolbar ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      onMouseMove={onMouseMove}>
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


// ─── Evidence viewer (inline in video area) ──────────────────────────────────

export function EvidenceViewer({ evidence, media, diveId, onClose, queryClient, evidenceShowCenterPauseBtn, showEvidenceCenterPauseBriefly }) {
  const { data: mediaUrl } = useMediaUrl(media?._id)
  const [dims, setDims] = useState(null)
  const [showEvidenceDetect, setShowEvidenceDetect] = useState(false)
  const [selectedEvidenceClass, setSelectedEvidenceClass] = useState(null)
  const [evidenceAnalyzeOpen, setEvidenceAnalyzeOpen] = useState(false)
  const [evidenceAnalyzeModel, setEvidenceAnalyzeModel] = useState('yolov8n')
  const [evidenceAnalyzeConf, setEvidenceAnalyzeConf] = useState(0.30)
  const [isEvidenceFullscreen, setIsEvidenceFullscreen] = useState(false)
  const [evidenceCurrentTime, setEvidenceCurrentTime] = useState(0)
  const [evidenceVideoDuration, setEvidenceVideoDuration] = useState(0)
  const [isEvidenceVideoPlaying, setIsEvidenceVideoPlaying] = useState(false)
  const [showEvidenceToolbar, setShowEvidenceToolbar] = useState(true)
  const [evidenceAnalyzePos, setEvidenceAnalyzePos] = useState({ top: 0, left: 0 })
  const evidenceVideoRef = useRef(null)
  const evidenceImageRef = useRef(null)
  const evidenceToolbarTimeoutRef = useRef(null)
  const evidenceAnalyzeBtnRef = useRef(null)
  const evidenceAnalyzePopRef = useRef(null)
  const isClip = evidence.type === 'clip'

  // Fetch available models
  const { data: models = [{ name: 'yolov8n', label: 'YOLOv8n General', speed: 'fast' }] } = useQuery({
    queryKey: ['yolo-models'],
    queryFn:  () => api.get('/media/models').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // Evidence AI labels - filter by current time if per-frame
  // frameTime may be absolute (parent video time) or 0-based (relative to clip start)
  const evidenceActiveLabs = useMemo(() => {
    const labs = evidence.aiLabels || []
    if (!labs.length) return []
    const hasPerFrame = labs.some(l => l.frameTime != null)
    // If no per-frame data or not a clip, show all labels
    if (!hasPerFrame || !isClip) return labs
    // Filter to labels with frameTime
    const withFrame = labs.filter(l => l.frameTime != null)
    if (!withFrame.length) return labs
    // Determine if frameTimes are absolute (parent video time) or 0-based
    // by checking if any frameTime >= startTime (absolute) vs all < startTime (0-based)
    const startTime = evidence.startTime || 0
    const isAbsolute = withFrame.some(l => l.frameTime >= startTime - 0.5)
    const compareTime = isAbsolute ? evidenceCurrentTime + startTime : evidenceCurrentTime
    // Find nearest frame time (same approach as MainMedia)
    const nearestTime = withFrame.reduce((best, l) =>
      Math.abs(l.frameTime - compareTime) < Math.abs(best - compareTime) ? l.frameTime : best,
      withFrame[0].frameTime)
    // Hide when nearest detection is more than 0.7s away (sparse or end-of-video)
    if (Math.abs(nearestTime - compareTime) > 0.7) return []
    return withFrame.filter(l => l.frameTime === nearestTime)
  }, [evidence.aiLabels, isClip, evidenceCurrentTime, evidence.startTime])

  const evidenceClassGroups = useMemo(() => {
    if (!evidenceActiveLabs.length) return []
    const map = {}
    evidenceActiveLabs.forEach(l => {
      if (!map[l.name]) map[l.name] = { name: l.name, count: 0, maxConf: 0 }
      map[l.name].count++
      if (l.confidence > map[l.name].maxConf) map[l.name].maxConf = l.confidence
    })
    return Object.values(map).sort((a, b) => b.maxConf - a.maxConf)
  }, [evidenceActiveLabs])

  // Labels passed to DetectionSVG — filtered by selectedEvidenceClass when active
  const visibleEvidenceLabs = useMemo(() =>
    selectedEvidenceClass ? evidenceActiveLabs.filter(l => l.name === selectedEvidenceClass) : evidenceActiveLabs
  , [evidenceActiveLabs, selectedEvidenceClass])

  const repositionEvidenceAnalyze = useCallback(() => {
    if (!evidenceAnalyzeBtnRef.current) return
    const r = evidenceAnalyzeBtnRef.current.getBoundingClientRect()
    setEvidenceAnalyzePos({
      top:  r.bottom + 6,
      left: Math.min(r.right - 260, window.innerWidth - 272),
    })
  }, [])

  const handleEvidenceAnalyze = useCallback(async () => {
    if (!evidence?._id || evidence.analysisStatus === 'pending') return
    try {
      await api.post(`/snapshots/${evidence._id}/analyze`, {
        model: evidenceAnalyzeModel,
        confidence: evidenceAnalyzeConf
      })
      queryClient.invalidateQueries({ queryKey: ['snapshots', diveId] })
      setEvidenceAnalyzeOpen(false)
    } catch (err) {
      console.error('Evidence analysis failed:', err)
    }
  }, [evidence?._id, evidence.analysisStatus, diveId, evidenceAnalyzeModel, evidenceAnalyzeConf, queryClient])

  // Close analyze popup on outside click
  useEffect(() => {
    if (!evidenceAnalyzeOpen) return
    const onOutside = (e) => {
      if (!evidenceAnalyzePopRef.current?.contains(e.target) && !evidenceAnalyzeBtnRef.current?.contains(e.target))
        setEvidenceAnalyzeOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [evidenceAnalyzeOpen])

  const handleEvidenceDownload = useCallback(async (format) => {
    if (!evidence) return
    try {
      if (format === 'png') {
        const mediaElement = isClip ? evidenceVideoRef.current : evidenceImageRef.current
        
        if (showEvidenceDetect && dims && mediaElement && visibleEvidenceLabs.length > 0) {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = dims.w
            canvas.height = dims.h
            const ctx = canvas.getContext('2d')
            
            ctx.drawImage(mediaElement, 0, 0, dims.w, dims.h)

            visibleEvidenceLabs.forEach(l => {
              if (!l.bbox) return
              const { x1, y1, x2, y2 } = l.bbox
              const px1 = x1 * dims.w, py1 = y1 * dims.h
              const pw  = (x2 - x1) * dims.w, ph = (y2 - y1) * dims.h
              const isHigh = l.confidence > 0.8
              const color = isHigh ? '#60a5fa' : '#fbbf24'
              
              ctx.strokeStyle = color
              ctx.lineWidth = Math.max(dims.w * 0.003, 2)
              ctx.strokeRect(px1, py1, pw, ph)
              
              const fs = Math.max(dims.h * 0.028, 12)
              const lh = fs * 1.6
              const text = `${l.name} ${Math.round(l.confidence * 100)}%`
              ctx.font = `700 ${fs}px system-ui, sans-serif`
              const textMetrics = ctx.measureText(text)
              const labelW = textMetrics.width + fs * 1.2
              
              ctx.fillStyle = color
              ctx.globalAlpha = 0.9
              ctx.fillRect(px1, Math.max(0, py1 - lh), Math.min(labelW, pw + ctx.lineWidth), lh)
              
              ctx.globalAlpha = 1.0
              ctx.fillStyle = 'black'
              ctx.fillText(text, px1 + 4, Math.max(lh * 0.78, py1 - lh * 0.22))
            })

            const dataUrl = canvas.toDataURL('image/png')
            const a = document.createElement('a')
            a.href = dataUrl
            a.download = `evidence-${String(evidence._id).slice(-6)}-detected.png`
            a.click()
            return
          } catch (canvasErr) {
            console.error('Failed to export canvas (likely CORS tainted), falling back to normal download:', canvasErr)
          }
        }
        
        // Normal download
        const result = await api.get(`/snapshots/${evidence._id}/download-url`)
        const { url, filename } = result.data
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
      } else if (format === 'mp4' && isClip) {
        // Fetch via API to include Authorization token, then blob download
        const blob = await api.get(`/snapshots/${evidence._id}/download-clip`, { responseType: 'blob' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `clip-${String(evidence._id).slice(-6)}.mp4`
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Download failed:', err)
    }
  }, [evidence, isClip, showEvidenceDetect, dims, visibleEvidenceLabs])

  const handleEvidenceVideoMouseMove = useCallback(() => {
    setShowEvidenceToolbar(true)
    if (evidenceToolbarTimeoutRef.current) clearTimeout(evidenceToolbarTimeoutRef.current)
    evidenceToolbarTimeoutRef.current = setTimeout(() => {
      setShowEvidenceToolbar(false)
    }, 3000)
  }, [])

  const handleEvidenceTimeUpdate = useCallback(() => {
    if (!evidenceVideoRef.current || !evidence) return
    const v = evidenceVideoRef.current
    const { startTime = 0, endTime } = evidence
    const clipDuration = (endTime || v.duration) - startTime
    const elapsed = Math.max(0, Math.min(v.currentTime - startTime, clipDuration))

    setEvidenceCurrentTime(elapsed)

    if (endTime && v.currentTime >= endTime - 0.05) {
      v.pause()
    }
  }, [evidence])

  useEffect(() => {
    return () => {
      if (evidenceToolbarTimeoutRef.current) clearTimeout(evidenceToolbarTimeoutRef.current)
    }
  }, [])

  if (!evidence) return null

  return (
    <div className="absolute inset-0 z-40 bg-black group w-full h-full"
      style={{ pointerEvents: 'auto' }}
      onClick={handleEvidenceVideoMouseMove}
      onMouseMove={handleEvidenceVideoMouseMove}>

      {/* Video/Image Player - full area */}
      <div className="absolute inset-0 bg-black"
        onMouseMove={handleEvidenceVideoMouseMove}>
        {isClip && mediaUrl ? (
          <div className="relative w-full h-full cursor-pointer"
            onClick={() => { const v = evidenceVideoRef.current; if (!v) return; if (v.paused) { if (v.currentTime >= (evidence.endTime || v.duration) - 0.1) v.currentTime = evidence.startTime; v.play().catch(()=>{}); } else { v.pause(); showEvidenceCenterPauseBriefly(); } }}>
            <video ref={evidenceVideoRef}
              src={mediaUrl}
              className="w-full h-full object-contain"
              onClick={e => { e.stopPropagation(); const v = e.currentTarget; if (v.paused) { if (v.currentTime >= (evidence.endTime || v.duration) - 0.1) v.currentTime = evidence.startTime; v.play().catch(()=>{}); } else { v.pause(); showEvidenceCenterPauseBriefly(); } }}
              onLoadedMetadata={e => {
                const { startTime = 0, endTime } = evidence
                setDims({ w: e.target.videoWidth, h: e.target.videoHeight })
                setEvidenceVideoDuration((endTime || e.target.duration) - startTime)
                e.target.currentTime = startTime
                showEvidenceCenterPauseBriefly()
              }}
              onTimeUpdate={handleEvidenceTimeUpdate}
              onPlay={() => setIsEvidenceVideoPlaying(true)}
              onPause={() => setIsEvidenceVideoPlaying(false)} />
          </div>
        ) : (
          <img ref={evidenceImageRef} src={evidence.imageUrl || evidence.thumbnailUrl} alt="evidence"
            className="w-full h-full object-contain"
            onLoad={e => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
        )}

        {/* Top Header - overlays video */}
        <div className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-200
                        px-3 pt-2 pb-3 bg-gradient-to-b from-black/60 to-transparent
                        ${evidenceAnalyzeOpen || showEvidenceToolbar ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex items-center justify-between gap-2">
            <button onClick={onClose}
              className="flex items-center gap-1.5 text-[11px] font-bold text-white/80 hover:text-white">
              <ArrowLeft size={12} />
              <span>{isClip ? `Clip ${fmtVideoTime(evidence.startTime)} → ${fmtVideoTime(evidence.endTime)}` : `Photo ${fmtVideoTime(evidence.imageTime)}`}</span>
            </button>

            <div className="flex items-center gap-0.5">
              {/* Detect button */}
              {evidence.aiLabels?.length > 0 && (
                <button onClick={() => setShowEvidenceDetect(v => !v)}
                  className={`flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                    showEvidenceDetect ? 'bg-blue-500/90 text-white' : 'text-white/80 hover:text-white'
                  }`}>
                  {showEvidenceDetect ? <EyeOff size={10} /> : <Eye size={10} />}
                  <span className="hidden sm:inline">Detect</span>
                </button>
              )}

              {/* Analyze button */}
              <button ref={evidenceAnalyzeBtnRef}
                onClick={() => {
                  if (!evidenceAnalyzeOpen) repositionEvidenceAnalyze()
                  setEvidenceAnalyzeOpen(v => !v)
                }}
                className={`flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                  evidenceAnalyzeOpen ? 'bg-blue-500/90 text-white' : evidence.analysisStatus === 'pending' ? 'bg-blue-500/60 text-white animate-pulse' : 'text-white/80 hover:text-white'
                }`}>
                {evidence.analysisStatus === 'pending' ? <Loader size={10} className="animate-spin" /> : <Sparkles size={10} />}
                <span className="hidden sm:inline">{evidence.analysisStatus === 'pending' ? 'Analyzing' : 'Analyze'}</span>
              </button>

              {/* Download PNG button */}
              <button onClick={() => handleEvidenceDownload('png')}
                className="flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[10px] font-bold text-white/80 hover:text-white transition-colors">
                <Download size={10} />
                <span className="hidden sm:inline">PNG</span>
              </button>

              {/* Download MP4 button - only for clips */}
              {isClip && (
                <button onClick={() => handleEvidenceDownload('mp4')}
                  className="flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[10px] font-bold text-white/80 hover:text-white transition-colors">
                  <Download size={10} />
                  <span className="hidden sm:inline">MP4</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Detection overlay — filtered by selected class like MainMedia */}
        {showEvidenceDetect && visibleEvidenceLabs.length > 0 && (
          <DetectionSVG labels={visibleEvidenceLabs} dims={dims} />
        )}

        {/* Center pause button — shows for 2s when clicked during playback */}
        {isClip && evidenceShowCenterPauseBtn && (
          <button onClick={e => {
            e.stopPropagation()
            const v = evidenceVideoRef.current
            if (!v) return
            if (v.paused) { v.play().catch(() => {}) }
            else { v.pause(); showEvidenceCenterPauseBriefly() }
          }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 p-4 rounded-full
                       bg-white/20 hover:bg-white/30 transition-opacity opacity-100
                       backdrop-blur-sm border border-white/20">
            {isEvidenceVideoPlaying ? <Pause size={24} className="text-white" /> : <Play size={24} className="text-white" />}
          </button>
        )}

        {/* Analyze popover — matches AIAnalyzePopover style */}
        {evidenceAnalyzeOpen && createPortal(
          <div ref={evidenceAnalyzePopRef}
            className="z-[9999] w-64 rounded-xl shadow-2xl overflow-hidden
                       bg-[#0d1117]/96 backdrop-blur-xl border border-white/12 text-white fixed"
            style={{ top: evidenceAnalyzePos.top, left: evidenceAnalyzePos.left }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Sparkles size={13} className="text-violet-400 shrink-0" />
              <span className="text-sm font-semibold">AI Analysis</span>
              {evidence.analysisStatus && (
                <span className={`ml-auto text-[10px] font-medium capitalize
                  ${evidence.analysisStatus === 'done' ? 'text-emerald-400' : evidence.analysisStatus === 'pending' ? 'text-blue-400' : 'text-white/40'}`}>
                  {evidence.analysisStatus}
                </span>
              )}
            </div>

            {/* Model selector */}
            <div className="px-4 pt-2 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">Model</p>
              <div className="space-y-1 max-h-[180px] overflow-y-auto">
                {models.map(mod => {
                  const name = typeof mod === 'string' ? mod : mod.name
                  const label = mod.label ?? name
                  const isSelected = evidenceAnalyzeModel === name
                  return (
                    <button key={name} onClick={() => setEvidenceAnalyzeModel(name)}
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
                <span className="text-sm font-bold tabular-nums text-violet-300">{evidenceAnalyzeConf.toFixed(2)}</span>
              </div>
              <input type="range" min={0.10} max={0.90} step={0.05}
                value={evidenceAnalyzeConf} onChange={e => setEvidenceAnalyzeConf(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-violet-400" />
              <div className="flex justify-between text-[9px] text-white/25 mt-1 px-0.5">
                <span>0.10 · Nhạy</span>
                <span>0.90 · Chặt</span>
              </div>
            </div>

            {/* Run button */}
            <div className="px-4 pb-4">
              <button onClick={handleEvidenceAnalyze} disabled={evidence.analysisStatus === 'pending'}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                           font-semibold text-sm transition-colors
                           bg-violet-600 hover:bg-violet-500
                           disabled:opacity-50 disabled:cursor-not-allowed">
                {evidence.analysisStatus === 'pending'
                  ? <><Loader size={13} className="animate-spin" /> Running…</>
                  : <><Sparkles size={13} /> Run Analysis</>}
              </button>
            </div>
          </div>,
          document.body
        )}

        {/* Class badges — clickable to filter, animate with toolbar like MainMedia */}
        {showEvidenceDetect && evidenceClassGroups.length > 0 && (
          <div className={`absolute left-0 right-0 z-50
                          opacity-100
                          transition-[bottom] duration-200 ease-out
                          px-3 flex flex-wrap gap-1.5 pointer-events-none
                          ${evidenceAnalyzeOpen || showEvidenceToolbar ? 'bottom-14' : 'bottom-2'}`}>
            {selectedEvidenceClass && (
              <button onClick={() => setSelectedEvidenceClass(null)}
                className="pointer-events-auto px-2 py-1 text-[10px] font-bold rounded-full
                           bg-white/15 border border-white/25 text-white/70
                           hover:bg-white/25 hover:text-white transition-all select-none">
                ✕ all
              </button>
            )}
            {evidenceClassGroups.map(g => {
              const isSelected = selectedEvidenceClass === g.name
              const isOther    = selectedEvidenceClass !== null && !isSelected
              const isHigh     = g.maxConf > 0.8
              return (
                <button key={g.name}
                  onClick={() => setSelectedEvidenceClass(prev => prev === g.name ? null : g.name)}
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
          </div>
        )}
      </div>

      {/* Bottom Controls - matches CustomVideoControls */}
      {isClip && mediaUrl && (
        <EvidenceVideoControls
          videoRef={evidenceVideoRef}
          isPlaying={isEvidenceVideoPlaying}
          currentTime={evidenceCurrentTime}
          duration={evidence.endTime - evidence.startTime}
          showToolbar={evidenceAnalyzeOpen || showEvidenceToolbar}
          onMouseMove={handleEvidenceVideoMouseMove}
          startTime={evidence.startTime}
          endTime={evidence.endTime}
        />
      )}
    </div>
  )
}


// ─── Evidence Panel ───────────────────────────────────────────────────────────

function fmtVideoTime(sec) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function EvidenceCard({ snap, canEdit, diveId, queryClient, onSeek, onClick, onDelete, selectMode, selected, onSelect }) {
  const [deleting, setDeleting] = useState(false)

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
    <div className={`relative group/thumb rounded-lg overflow-hidden border-2 aspect-video
                     bg-slate-800 cursor-pointer hover:border-white/40 transition-colors
                     ${selectMode && selected ? 'border-blue-500' : 'border-white/20'}`}
         onClick={() => selectMode ? onSelect() : (onClick && onClick())}>
      {/* Thumbnail image */}
      {snap.imageUrl || snap.thumbnailUrl
        ? <img src={snap.imageUrl || snap.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
            <FileText size={20} className="text-slate-500" />
          </div>
      }

      {/* Type badge — top-left */}
      <div className="absolute top-1 left-1 text-[7px] font-bold uppercase tracking-wider
                      px-1.5 py-0.5 rounded leading-none text-white bg-black/40">
        {isClip ? 'video' : 'photo'}
      </div>

      {/* AI badge — top-right, shows analysis status */}
      {isDone && uniqueLabels.length > 0 && (
        <div className="absolute top-1 right-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full
                        bg-emerald-500/80 text-white leading-none">
          {uniqueLabels.length}
        </div>
      )}
      {isPending && (
        <div className="absolute top-1 right-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full
                        bg-blue-500/60 text-white leading-none flex items-center gap-0.5">
          <Loader size={7} className="animate-spin" />
        </div>
      )}
      {isFailed && (
        <div className="absolute top-1 right-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full
                        bg-red-500/60 text-white leading-none">
          err
        </div>
      )}

      {/* Time label — bottom */}
      <div className="absolute bottom-1 left-0 right-0 text-center text-[7px] text-white/80
                      font-mono px-1 bg-black/60 py-0.5">
        {timeLabel}
      </div>

      {/* Select Mode Overlay */}
      {selectMode && (
        <div className={`absolute inset-0 transition-colors ${selected ? 'bg-blue-500/30' : 'bg-black/0 hover:bg-black/10'}`}>
          <div className={`absolute top-1 right-1 w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
            selected ? 'bg-blue-500 border-blue-500' : 'bg-white/70 border-white'
          }`}>
            {selected && <CheckCircle2 size={10} className="text-white" strokeWidth={3} />}
          </div>
        </div>
      )}

      {/* Delete button — top-right corner, ghost button */}
      {canEdit && !selectMode && (
        <button onClick={e => { e.stopPropagation(); onDelete && onDelete() }}
          disabled={deleting}
          className="absolute -top-1 -right-1 p-1 rounded-full
                     opacity-0 group-hover/thumb:opacity-100 transition-opacity
                     bg-red-600 hover:bg-red-700 text-white disabled:opacity-40">
          {deleting ? <Loader size={10} className="animate-spin" /> : <X size={10} />}
        </button>
      )}
    </div>
  )
}

export function EvidencePanel({ snapshots, isOpen, diveId, canEdit, videoRef, queryClient, currentMediaId, onSelectEvidence, confirmDelete, setConfirmDelete, isHorizontal = false }) {
  // Filter snapshots to only show evidence belonging to current media
  const currentMediaSnapshots = snapshots.filter(s => s.parentMediaId === currentMediaId)

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => api.delete('/snapshots/bulk', { data: { ids } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['snapshots', diveId] })
      toast.success(`${res.data?.deleted ?? selected.size} item(s) deleted`)
      setSelected(new Set())
      setSelectMode(false)
      setConfirmBulkDelete(false)
    },
    onError: () => toast.error('Failed to delete items')
  })

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }
  const toggleSelect = (id) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const selectAll = () => setSelected(selected.size === currentMediaSnapshots.length ? new Set() : new Set(currentMediaSnapshots.map(m => m._id)))

  if (isHorizontal) {
    if (!isOpen) return null
    return (
      <div className="flex-none w-full h-[110px] bg-black/80 flex items-center gap-2 px-3 overflow-x-auto overflow-y-hidden border-t border-white/10 z-40">
        <div className="shrink-0 flex flex-col justify-center px-3 border-r border-white/10 mr-1 h-[80%] min-w-[80px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Evidence</p>
          
          {!selectMode ? (
            <>
              <p className="text-[9px] text-white/30 mb-1">{currentMediaSnapshots.length} item{currentMediaSnapshots.length !== 1 ? 's' : ''}</p>
              {canEdit && currentMediaSnapshots.length > 0 && (
                <button onClick={() => setSelectMode(true)} className="text-[9px] font-bold text-white/50 hover:text-white uppercase transition-colors self-start">
                  Select
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-1.5 mt-1">
              <button onClick={selectAll} className="text-[9px] text-white/70 hover:text-white px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors self-start">
                {selected.size === currentMediaSnapshots.length ? 'Deselect' : 'Select All'}
              </button>
              <div className="flex items-center gap-1">
                {selected.size > 0 && (
                  <button onClick={() => setConfirmBulkDelete(true)} className="p-1 rounded bg-red-500/80 hover:bg-red-500 text-white transition-colors" title="Delete selected">
                    <Trash2 size={10} />
                  </button>
                )}
                <button onClick={exitSelectMode} className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors" title="Cancel">
                  <X size={10} />
                </button>
              </div>
            </div>
          )}
        </div>
        {currentMediaSnapshots.length === 0 ? (
          <div className="flex items-center gap-2 px-4 opacity-40">
            <Camera size={14} className="text-white/50" />
            <p className="text-[10px] text-white/50">No evidence yet.</p>
          </div>
        ) : (
          currentMediaSnapshots.map(snap => (
            <div key={snap._id} className="shrink-0 w-32">
              <EvidenceCard
                snap={snap}
                canEdit={canEdit}
                diveId={diveId}
                queryClient={queryClient}
                onClick={() => onSelectEvidence(snap)}
                onDelete={() => setConfirmDelete(snap)}
                onSeek={(t) => {
                  const v = videoRef.current
                  if (v && t != null) { v.currentTime = t; v.play().catch(() => {}) }
                }}
                selectMode={selectMode}
                selected={selected.has(snap._id)}
                onSelect={() => toggleSelect(snap._id)}
              />
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className={`absolute top-0 right-0 bottom-0 z-10 w-44
                     bg-black/90 backdrop-blur-sm border-l border-white/10
                     overflow-y-auto flex flex-col
                     transition-transform duration-200 ease-out
                     ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="pt-[52px] px-3 pb-2.5 border-b border-white/10 shrink-0 sticky top-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Evidence</p>
          {canEdit && currentMediaSnapshots.length > 0 && !selectMode && (
            <button onClick={() => setSelectMode(true)} className="text-[9px] font-bold text-white/50 hover:text-white uppercase transition-colors">
              Select
            </button>
          )}
        </div>
        {!selectMode ? (
          <p className="text-[8px] text-white/30">
            {currentMediaSnapshots.length} item{currentMediaSnapshots.length !== 1 ? 's' : ''}
          </p>
        ) : (
          <div className="flex items-center justify-between mt-1">
            <button onClick={selectAll} className="text-[9px] text-white/70 hover:text-white px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors">
              {selected.size === currentMediaSnapshots.length ? 'Deselect All' : 'Select All'}
            </button>
            <div className="flex items-center gap-1">
              {selected.size > 0 && (
                <button onClick={() => setConfirmBulkDelete(true)} className="p-1 rounded bg-red-500/80 hover:bg-red-500 text-white transition-colors" title="Delete selected">
                  <Trash2 size={10} />
                </button>
              )}
              <button onClick={exitSelectMode} className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors" title="Cancel">
                <X size={10} />
              </button>
            </div>
          </div>
        )}
      </div>

      {currentMediaSnapshots.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
          <Camera size={20} className="text-white/20" />
          <p className="text-[9px] text-white/30 text-center leading-relaxed">
            No evidence yet.<br />
            Use 📷 or 🎬 while<br />
            video is playing.
          </p>
        </div>
      ) : (
        <div className="p-2 pb-16 flex flex-col gap-2">
          {currentMediaSnapshots.map(snap => (
            <EvidenceCard
              key={snap._id}
              snap={snap}
              canEdit={canEdit}
              diveId={diveId}
              queryClient={queryClient}
              onClick={() => onSelectEvidence(snap)}
              onDelete={() => setConfirmDelete(snap)}
              onSeek={(t) => {
                const v = videoRef.current
                if (v && t != null) { v.currentTime = t; v.play().catch(() => {}) }
              }}
              selectMode={selectMode}
              selected={selected.has(snap._id)}
              onSelect={() => toggleSelect(snap._id)}
            />
          ))}
        </div>
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title="Delete Evidence"
          message={`Are you sure you want to delete ${selected.size} item(s)?`}
          loading={bulkDeleteMutation.isPending}
          onConfirm={() => bulkDeleteMutation.mutate([...selected])}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  )
}


