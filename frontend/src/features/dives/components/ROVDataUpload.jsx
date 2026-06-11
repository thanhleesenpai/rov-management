import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, FolderOpen, Upload, File, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Activity, Waves, Radio, Film, ImageIcon,
  Archive, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE = {
  sensor:  { label: 'Sensor CSV', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',      Icon: Activity  },
  dvl:     { label: 'DVL Path',   cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', Icon: Radio  },
  sonar:   { label: 'Sonar',      cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',       Icon: Waves     },
  video:   { label: 'Video',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   Icon: Film      },
  image:   { label: 'Image',      cls: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',       Icon: ImageIcon },
  zip:     { label: 'ZIP',        cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', Icon: Archive },
  unknown: { label: 'Unknown',    cls: 'bg-muted text-muted-foreground',                                          Icon: File      },
}

function classify(filepath) {
  const lower = filepath.toLowerCase()
  const base  = lower.split('/').pop()
  if (base.match(/^dvl_.*\.json$/)) return 'dvl'
  if (lower.endsWith('.sonar'))     return 'sonar'
  if (lower.endsWith('.zip'))       return 'zip'
  if (lower.endsWith('.csv'))       return 'sensor'
  if (lower.match(/\.(mp4|webm|mov|avi|mkv)$/)) return 'video'
  if (lower.match(/\.(jpg|jpeg|png|webp)$/))    return 'image'
  return 'unknown'
}

function fmtSize(b) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── MIME resolver ─────────────────────────────────────────────────────────────

const EXT_MIME = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

function getMime(file) {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  return EXT_MIME[ext] || 'application/octet-stream'
}

// ── Parse dive name from file timestamps ──────────────────────────────────────

function parseDiveName(items) {
  for (const item of items) {
    const m = item.filename.match(/(\d{8})_(\d{6})/)
    if (m) {
      const [, date, time] = m
      const y = date.slice(0, 4), mo = date.slice(4, 6), d = date.slice(6, 8)
      const h = time.slice(0, 2), mi = time.slice(2, 4)
      return `Dive ${y}-${mo}-${d} ${h}:${mi}`
    }
  }
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `Dive ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

// ── Presigned media upload ────────────────────────────────────────────────────

async function uploadMediaFile(file, diveId, tripId, onProgress, recordedAt) {
  const mimeType = getMime(file)
  const { uploadUrl, media } = await api.post('/media/presigned-url', {
    diveId, tripId,
    fileName: file.name,
    mimeType,
    size: file.size,
    ...(recordedAt && { recordedAt: new Date(recordedAt).toISOString() }),
  }).then(r => r.data)

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error(`S3 error: ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', mimeType)
    xhr.send(file)
  })

  await api.patch(`/media/${media._id}/confirm`)
  return media
}

// ── CSV preview parser ────────────────────────────────────────────────────────

const COL_MAP = {
  time: 'timestamp', timestamp: 'timestamp', datetime: 'timestamp',
  depth: 'depth', depth_m: 'depth',
  watertemperature: 'temp', water_temp: 'temp', water_temperature: 'temp',
  temperature: 'temperature', temp: 'temp', temp_c: 'temp',
  tempambient: 'temperature',
  pressure: 'pressure', pressure_bar: 'pressure',
  roll: 'roll', pitch: 'pitch', yaw: 'yaw', heading: 'yaw',
  voltage: 'voltage', volt: 'voltage',
  battery_percent: 'battery_percent', battery: 'battery_percent',
  humidity: 'humidity',
  lat: 'lat', latitude: 'lat',
  lng: 'lng', lon: 'lng', longitude: 'lng',
  holddepth: 'holdDepth', hold_depth: 'holdDepth',
  holdheading: 'holdHeading', hold_heading: 'holdHeading',
  manual: 'manual',
  cameratilt: 'cameraTilt', camera_tilt: 'cameraTilt',
  lightlevel: 'lightLevel', light_level: 'lightLevel',
  powerlevel: 'powerLevel', power_level: 'powerLevel',
}

function parseCsvPreview(text, filename) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: 0, mapping: {}, warnings: ['File appears empty'], hasGps: false }

  const delimCandidates = [';', ',', '\t']
  let delim = ','
  let best = 0
  for (const d of delimCandidates) {
    const n = lines[0].split(d).length - 1
    if (n > best) { best = n; delim = d }
  }

  const headers = lines[0].split(delim).map(h => h.trim())
  const sortedPairs = headers
    .map((h, i) => ({ orig: h, key: h.toLowerCase().replace(/[^a-z_]/g, ''), i }))
    .sort((a, b) => (a.key === 'watertemperature' ? -1 : b.key === 'watertemperature' ? 1 : 0))

  const mapping = {}
  const used = new Set()
  for (const { orig, key } of sortedPairs) {
    const field = COL_MAP[key]
    if (field && !used.has(field)) { mapping[orig] = field; used.add(field) }
  }

  const warnings = []
  if (!used.has('depth'))     warnings.push('No depth column detected')
  if (!used.has('timestamp')) warnings.push('No timestamp column detected')
  const hasWaterTemp = headers.some(h => h.toLowerCase().replace(/\s/g,'') === 'watertemperature')
  const hasTemp = headers.some(h => h.toLowerCase() === 'temperature')
  if (hasWaterTemp && hasTemp) warnings.push('WaterTemperature → temp (Environment), Temperature → temperature (System)')

  // Extract first timestamp for video auto-sync
  let firstTimestamp = null
  if (used.has('timestamp') && lines.length >= 2) {
    const tsPair = sortedPairs.find(p => COL_MAP[p.key] === 'timestamp')
    if (tsPair !== undefined) {
      const firstRow = lines[1].split(delim)
      const tsVal = (firstRow[tsPair.i] || '').trim()
      if (tsVal) {
        let d = new Date(tsVal)
        if (isNaN(d.getTime()) && /^\d{2}:\d{2}:\d{2}$/.test(tsVal)) {
          const m = filename.match(/(\d{8})/)
          if (m) {
            const date = m[1]
            d = new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${tsVal}Z`)
          }
        }
        if (!isNaN(d.getTime())) firstTimestamp = d
      }
    }
  }

  return { rows: lines.length - 1, mapping, warnings, hasGps: used.has('lat') && used.has('lng'), firstTimestamp }
}

// ── Auto-sync: apply sensor first timestamp to video items ────────────────────

function applyAutoSync(items) {
  const sensorTs = items.find(i => i.type === 'sensor' && i.preview?.firstTimestamp)?.preview?.firstTimestamp
  if (!sensorTs) return items
  return items.map(item =>
    item.type === 'video'
      ? { ...item, recordedAt: sensorTs, recordedAtAutoSync: true }
      : item
  )
}

// ── DVL preview parser ────────────────────────────────────────────────────────

function parseDvlPreview(text) {
  let valid = 0, total = 0
  for (const line of text.trim().split('\n')) {
    try {
      const obj = JSON.parse(line.trim())
      if (obj.type === 'position_local') { total++; if (obj.status === 0) valid++ }
    } catch { /* skip */ }
  }
  return { total, valid }
}

// ── Sonar preview parser (binary in browser) ──────────────────────────────────

function parseSonarPreview(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const buf = e.target.result
      const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 8))
      if (magic !== 'SONAR360') { reject(new Error(`Invalid magic: "${magic}"`)); return }
      const dv = new DataView(buf)
      const HEADER = 32, FHDR = 12
      let offset = HEADER, frames = 0, firstTs = null, lastTs = null
      while (offset + FHDR <= buf.byteLength) {
        const lo = dv.getUint32(offset, true)
        const hi = dv.getUint32(offset + 4, true)
        const tsMs = hi * 0x100000000 + lo
        const numSamples = dv.getUint16(offset + 10, true)
        if (offset + FHDR + numSamples > buf.byteLength) break
        if (firstTs === null) firstTs = tsMs
        lastTs = tsMs
        frames++
        offset += FHDR + numSamples
      }
      resolve({ frames, durationMs: (firstTs !== null && lastTs !== null) ? lastTs - firstTs : 0 })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

// ── Analyze a single File object ──────────────────────────────────────────────

async function analyzeFile(file) {
  const filepath = file.webkitRelativePath || file.name
  const filename = filepath.split('/').pop()
  const type = classify(filepath)
  const base = { id: `${filename}-${file.size}`, file, filename, filepath, type, size: file.size }

  try {
    if (type === 'sensor') {
      const text = await file.text()
      const preview = parseCsvPreview(text, filename)
      return { ...base, preview, ok: preview.rows > 0, error: preview.rows === 0 ? 'No data rows' : null }
    }
    if (type === 'dvl') {
      const text = await file.text()
      const preview = parseDvlPreview(text)
      return { ...base, preview, ok: preview.valid > 0, error: preview.valid === 0 ? 'No valid points (status=0)' : null }
    }
    if (type === 'sonar') {
      const preview = await parseSonarPreview(file)
      return { ...base, preview, ok: true, error: null }
    }
    return { ...base, preview: null, ok: type !== 'unknown', error: null }
  } catch (e) {
    return { ...base, preview: null, ok: false, error: e.message }
  }
}

// ── Column mapping preview ────────────────────────────────────────────────────

function MappingTable({ mapping }) {
  const entries = Object.entries(mapping)
  if (!entries.length) return <p className="text-xs text-muted-foreground">No columns mapped</p>
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {entries.map(([col, field]) => (
        <span key={col} className="inline-flex items-center gap-1 text-[10px] bg-muted rounded px-1.5 py-0.5">
          <span className="text-muted-foreground">{col}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium text-foreground">{field}</span>
        </span>
      ))}
    </div>
  )
}

// ── Single item row ───────────────────────────────────────────────────────────

function ItemRow({ item, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const { label, cls, Icon } = TYPE[item.type] ?? TYPE.unknown
  const isExcluded = item.type === 'unknown'
  const hasMapping = item.type === 'sensor' && item.preview?.mapping && Object.keys(item.preview.mapping).length > 0

  return (
    <div className={`rounded-lg border ${isExcluded ? 'border-border opacity-60' : item.ok ? 'border-border' : 'border-destructive/40'} bg-muted/40`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
          <Icon size={10} />
          {label}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate" title={item.filepath}>
            {item.filename}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {item.type === 'sensor' && item.preview &&
              `${item.preview.rows.toLocaleString()} rows${item.preview.hasGps ? ' · GPS ✓' : ''}`}
            {item.type === 'dvl' && item.preview &&
              `${item.preview.valid.toLocaleString()} valid pts (${item.preview.total} total)`}
            {item.type === 'sonar' && item.preview &&
              `${item.preview.frames} frames · ${fmtMs(item.preview.durationMs)} · ${fmtSize(item.size)}`}
            {item.type === 'video' && (
              item.recordedAt
                ? <>{fmtSize(item.size)} · <span className="text-primary">⏱ {new Date(item.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{item.recordedAtAutoSync ? ' (synced)' : ''}</span></>
                : fmtSize(item.size)
            )}
            {item.type === 'image' && fmtSize(item.size)}
            {item.type === 'zip' && `${fmtSize(item.size)} — server will extract`}
            {item.type === 'unknown' && fmtSize(item.size)}
            {item.error && <span className="text-destructive ml-1">· {item.error}</span>}
          </p>
        </div>

        {hasMapping && (
          <button onClick={() => setExpanded(v => !v)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}

        {!item.ok && !isExcluded
          ? <AlertCircle size={13} className="text-destructive shrink-0" />
          : !isExcluded && <CheckCircle2 size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
        }

        <button onClick={() => onRemove(item.id)}
          className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0">
          <X size={13} />
        </button>
      </div>

      {expanded && hasMapping && (
        <div className="px-3 pb-2 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground mt-1.5 mb-0.5">Column mapping:</p>
          <MappingTable mapping={item.preview.mapping} />
          {item.preview.warnings?.map((w, i) => (
            <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">⚠ {w}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Result summary ────────────────────────────────────────────────────────────

function ResultSummary({ result }) {
  const { sensor, dvl, sonar, uploadedMediaCount, mediaErrors, diveCreated, errors } = result
  return (
    <div className="space-y-1.5">
      {diveCreated && (
        <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 rounded-lg px-3 py-2">
          <CheckCircle2 size={13} />
          Created: <span className="font-medium">{diveCreated}</span>
        </div>
      )}
      {sensor?.ok && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={13} />
          Sensor: {sensor.count?.toLocaleString()} readings uploaded
        </div>
      )}
      {sensor && !sensor.ok && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          Sensor: {sensor.error}
        </div>
      )}
      {dvl?.ok && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={13} />
          DVL: {dvl.count?.toLocaleString()} points uploaded
        </div>
      )}
      {dvl && !dvl.ok && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          DVL: {dvl.error}
        </div>
      )}
      {sonar?.ok && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={13} />
          Sonar: {sonar.filename} ({sonar.frameCount} frames, {fmtMs(sonar.durationMs)})
        </div>
      )}
      {sonar && !sonar.ok && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          Sonar: {sonar.error}
        </div>
      )}
      {uploadedMediaCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={13} />
          Media: {uploadedMediaCount} file(s) uploaded
        </div>
      )}
      {mediaErrors?.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          {e.filename}: {e.error}
        </div>
      ))}
      {errors?.map((e, i) => (
        <div key={`e-${i}`} className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          {e.filename}: {e.error}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
// Props:
//   dive    — existing Dive object (upload to this dive)
//   tripId  — Trip ID (auto-create a new dive; mutually exclusive primary with dive)
//   onClose / onDiveCreated

export default function ROVDataUpload({ tripId, dive, onClose, onDiveCreated }) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStep, setUploadStep] = useState('') // 'creating' | 'batch' | 'media'
  const [uploadProgress, setUploadProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const isCreateMode = !dive && !!tripId
  const effectiveTripId = tripId ?? (dive?.trip?._id ?? dive?.trip)

  const folderRef = useRef()
  const fileRef = useRef()

  useEffect(() => {
    if (folderRef.current) folderRef.current.setAttribute('webkitdirectory', '')
  }, [])

  const addFiles = async (newFiles) => {
    if (!newFiles.length) return
    setAnalyzing(true)
    const analyzed = await Promise.all(Array.from(newFiles).map(analyzeFile))
    setItems(prev => {
      const existing = new Set(prev.map(i => i.id))
      const fresh = analyzed.filter(a => !existing.has(a.id))
      return applyAutoSync([...prev, ...fresh])
    })
    setAnalyzing(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) addFiles(files)
  }

  const batchItems = items.filter(i => ['sensor', 'dvl', 'sonar', 'zip'].includes(i.type) && i.ok)
  const mediaItems = items.filter(i => ['video', 'image'].includes(i.type) && i.ok)
  const uploadableCount = batchItems.length + mediaItems.length
  const sensorCount = items.filter(i => i.type === 'sensor' && i.ok).length
  const sonarCount  = items.filter(i => i.type === 'sonar'  && i.ok).length
  const unknownCount = items.filter(i => i.type === 'unknown').length

  const uploadAll = async () => {
    if (!uploadableCount) return
    setUploading(true)
    setUploadProgress(0)
    setResult(null)

    let diveId = dive?._id
    let createdDiveId = null
    let diveName = null

    try {
      // Step 1: Auto-create dive if needed
      if (isCreateMode) {
        setUploadStep('creating')
        diveName = parseDiveName(items)
        const res = await api.post(`/trips/${effectiveTripId}/dives`, {
          title: diveName,
          description: 'Auto-imported from folder',
        })
        diveId = res.data._id
        createdDiveId = diveId
      }

      // Step 2: Batch upload (sensor/dvl/sonar/zip)
      let batchResult = null
      if (batchItems.length > 0) {
        setUploadStep('batch')
        const batchEnd = mediaItems.length > 0 ? 70 : 100
        try {
          const fd = new FormData()
          for (const item of batchItems) fd.append('files', item.file, item.filename)
          const res = await api.post(`/dives/${diveId}/data/upload-batch`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              if (e.total) setUploadProgress(Math.round(e.loaded / e.total * batchEnd))
            },
          })
          batchResult = res.data
        } catch (e) {
          // Batch failed → rollback created dive
          if (createdDiveId) {
            try { await api.delete(`/dives/${createdDiveId}`) } catch {}
          }
          throw e
        }
      }

      // Step 3: Media upload via presigned URL (partial failures are OK — keep dive)
      let uploadedMediaCount = 0
      const mediaErrors = []
      if (mediaItems.length > 0) {
        setUploadStep('media')
        const batchBase = batchItems.length > 0 ? 70 : 0
        for (let i = 0; i < mediaItems.length; i++) {
          const item = mediaItems[i]
          try {
            await uploadMediaFile(item.file, diveId, effectiveTripId, (pct) => {
              setUploadProgress(batchBase + Math.round((i + pct / 100) / mediaItems.length * (100 - batchBase)))
            }, item.recordedAt)
            uploadedMediaCount++
          } catch (e) {
            mediaErrors.push({ filename: item.filename, error: e.message })
          }
        }
      }

      setUploadProgress(100)
      setResult({
        ...(batchResult || {}),
        uploadedMediaCount,
        mediaErrors,
        diveCreated: createdDiveId ? diveName : null,
        diveId,
      })

      // Invalidate caches
      if (diveId) {
        queryClient.invalidateQueries({ queryKey: ['dives', diveId] })
        queryClient.invalidateQueries({ queryKey: ['sensor', diveId] })
        queryClient.invalidateQueries({ queryKey: ['dvl-path', diveId] })
        queryClient.invalidateQueries({ queryKey: ['sonar', diveId] })
        queryClient.invalidateQueries({ queryKey: ['media', diveId] })
      }
      if (effectiveTripId) queryClient.invalidateQueries({ queryKey: ['dives', effectiveTripId] })

      if (createdDiveId) onDiveCreated?.(diveId)

      toast.success(createdDiveId ? 'Dive created and data imported' : 'Upload complete')
    } catch (e) {
      toast.error(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
      setUploadStep('')
    }
  }

  const hasItems = items.length > 0
  const proposedDiveName = isCreateMode && hasItems ? parseDiveName(items) : null

  const stepLabel = {
    creating: 'Creating dive…',
    batch:    `Uploading ROV data… ${uploadProgress}%`,
    media:    `Uploading media… ${uploadProgress}%`,
  }[uploadStep] ?? `Uploading… ${uploadProgress}%`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg border border-border flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {isCreateMode
              ? <FolderOpen size={15} className="text-primary" />
              : <Upload size={15} className="text-primary" />
            }
            <h2 className="font-semibold text-foreground text-sm">
              {isCreateMode ? 'Import Folder' : 'Upload ROV Data'}
            </h2>
            {!isCreateMode && dive?.title && (
              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{dive.title}</span>
            )}
            {isCreateMode && (
              <span className="text-xs text-muted-foreground">— auto-create dive</span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-4 transition-colors
              ${dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
          >
            <div className="flex items-center justify-center gap-3">
              <div className="text-center">
                <Upload size={18} className="mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs font-medium text-foreground">
                  {hasItems ? 'Drop more files' : 'Drop files or folder here'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  .csv · .json · .sonar · .zip · video · image
                </p>
              </div>
              <div className="text-muted-foreground text-xs">or</div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => folderRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                             bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <FolderOpen size={12} /> Select folder
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                             border border-border text-foreground hover:bg-muted transition-colors"
                >
                  <Upload size={12} /> Select files
                </button>
              </div>
            </div>

            <input ref={folderRef} type="file" className="hidden" multiple
              onChange={(e) => addFiles(e.target.files)} />
            <input ref={fileRef} type="file" className="hidden" multiple
              accept=".csv,.json,.sonar,.zip,video/*,image/*"
              onChange={(e) => addFiles(e.target.files)} />
          </div>

          {/* Analyzing spinner */}
          {analyzing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={13} className="animate-spin" /> Analysing files…
            </div>
          )}

          {/* Multiple sensor/sonar warnings */}
          {sensorCount > 1 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400
                            bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {sensorCount} sensor CSV files — only the last one will be saved. Remove duplicates.
            </div>
          )}
          {sonarCount > 1 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400
                            bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {sonarCount} sonar files — only the first one will be saved (1 per dive). Remove duplicates.
            </div>
          )}

          {/* Items list */}
          {items.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Detected files ({items.length})
              </p>
              {items.map(item => (
                <ItemRow key={item.id} item={item}
                  onRemove={(id) => setItems(prev => prev.filter(i => i.id !== id))} />
              ))}
            </div>
          )}

          {/* Unknown files note */}
          {unknownCount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {unknownCount} unrecognized file(s) will be skipped.
            </p>
          )}

          {/* Create-mode: show proposed dive name */}
          {isCreateMode && proposedDiveName && !uploading && !result && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
              <FolderOpen size={12} className="shrink-0 text-primary" />
              Will create: <span className="font-medium text-foreground ml-0.5">{proposedDiveName}</span>
            </div>
          )}

          {/* Upload result */}
          {result && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Result</p>
              <ResultSummary result={result} />
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-4 py-3 border-t border-border shrink-0">
            {uploading && (
              <div className="mb-2">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-200 rounded-full"
                    style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{stepLabel}</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground">
                {uploadableCount > 0
                  ? `${uploadableCount} file(s) ready to upload`
                  : 'No uploadable files selected'}
              </p>
              <button
                onClick={uploadAll}
                disabled={!uploadableCount || uploading || analyzing}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold
                           bg-primary text-primary-foreground hover:bg-primary/90
                           disabled:opacity-50 transition-colors"
              >
                {uploading
                  ? <><Loader2 size={12} className="animate-spin" /> {uploadStep === 'creating' ? 'Creating…' : 'Uploading…'}</>
                  : <><Upload size={12} /> {isCreateMode ? 'Import All' : 'Upload All'}</>
                }
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="px-4 py-3 border-t border-border shrink-0 flex justify-end gap-2">
            <button onClick={() => { setResult(null); setItems([]) }}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
              Import more
            </button>
            <button onClick={onClose}
              className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold">
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
