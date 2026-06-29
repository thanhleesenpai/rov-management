import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Activity, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Standard CSV parser ───────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('File must have a header row and at least one data row')

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const required = ['timestamp', 'depth', 'temp']
  for (const col of required) {
    if (!headers.includes(col)) throw new Error(`Missing required column: "${col}"`)
  }

  return lines.slice(1).map((line, i) => {
    const values = line.split(',').map(v => v.trim())
    const row = {}
    headers.forEach((h, j) => { row[h] = values[j] })
    if (!row.timestamp || row.depth == null || row.temp == null) {
      throw new Error(`Row ${i + 2}: missing required values`)
    }
    return row
  })
}

// ── GCS CSV parser (comma-decimal separator, time-only timestamps) ────────────
//
// GCS format: Time,Roll,Pitch,Yaw,Depth,Voltage,HoldDepth,HoldHeading,Manual,Humidity,Temperature,CameraTilt,LightLevel
// Values use comma as decimal separator: "0,51" = 0.51, "-158,01" = -158.01
// Integers (HoldDepth, HoldHeading, CameraTilt, LightLevel) are NOT merged.

const GCS_COL_TYPES = {
  time: 'string', roll: 'float', pitch: 'float', yaw: 'float',
  depth: 'float', voltage: 'float', holddepth: 'int', holdheading: 'int',
  manual: 'string', humidity: 'float', temperature: 'float',
  cameratilt: 'int', lightlevel: 'int',
}

function isGCSFormat(headers) {
  return headers.includes('time') && headers.includes('temperature') && headers.includes('lightlevel')
}

// Re-assemble tokens split across comma-decimal boundaries using schema knowledge.
// e.g. ['0','51'] → '0.51' for float columns, but ['0','0'] → '0','0' for int columns.
function reassembleCommaDecimal(rawTokens, headers) {
  const result = []
  let ti = 0
  for (let ci = 0; ci < headers.length && ti < rawTokens.length; ci++) {
    const type = GCS_COL_TYPES[headers[ci]] ?? 'string'
    const cur  = rawTokens[ti]
    if (type === 'float' && ti + 1 < rawTokens.length) {
      const nxt = rawTokens[ti + 1]
      // Merge if left is an integer (possibly negative) and right is all digits
      if (/^-?\d+$/.test(cur) && /^\d+$/.test(nxt)) {
        result.push(`${cur}.${nxt}`)
        ti += 2
        continue
      }
    }
    result.push(cur)
    ti++
  }
  return result
}

function parseGCS(text, baseDate) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('File must have a header row and at least one data row')

  const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase())
  if (!isGCSFormat(rawHeaders)) throw new Error('Not a GCS format file')

  return lines.slice(1).map((line, i) => {
    const rawTokens = line.split(',').map(v => v.trim())
    const values    = reassembleCommaDecimal(rawTokens, rawHeaders)
    const row = {}
    rawHeaders.forEach((h, j) => { row[h] = values[j] ?? null })

    const timeStr = (row.time || '').trim()
    if (!timeStr) throw new Error(`Row ${i + 2}: missing Time value`)

    const depth = row.depth != null ? Math.abs(parseFloat(row.depth)) : null
    if (depth == null || isNaN(depth)) throw new Error(`Row ${i + 2}: invalid Depth value`)

    return {
      timestamp:  `${baseDate}T${timeStr}`,
      depth,
      temp:       row.temperature != null ? parseFloat(row.temperature) : null,
      pressure:   null,
      roll:       row.roll        != null ? parseFloat(row.roll)        : null,
      pitch:      row.pitch       != null ? parseFloat(row.pitch)       : null,
      yaw:        row.yaw         != null ? parseFloat(row.yaw)         : null,
      voltage:    row.voltage     != null ? parseFloat(row.voltage)     : null,
      humidity:   row.humidity    != null ? parseFloat(row.humidity)    : null,
    }
  })
}

// ── Unified file reader ───────────────────────────────────────────────────────

function parseFile(file, baseDate) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(text)
          if (!Array.isArray(data)) throw new Error('JSON must be an array of readings')
          resolve({ readings: data, format: 'json' })
        } else {
          const headers = text.split('\n')[0].split(',').map(h => h.trim().toLowerCase())
          if (isGCSFormat(headers)) {
            resolve({ readings: parseGCS(text, baseDate), format: 'gcs' })
          } else {
            resolve({ readings: parseCSV(text), format: 'standard' })
          }
        }
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export default function SensorUpload({ trip, projectId, projectGpsLocation, onClose }) {
  const tripId = trip._id
  const queryClient = useQueryClient()
  const fileRef = useRef()
  const [parsed, setParsed] = useState(null)   // { readings, fileName, format }
  const [parseError, setParseError] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  // pending = { readings, distanceKm } when GPS warning needs confirmation
  const [pendingUpload, setPendingUpload] = useState(null)

  const hasData = (trip.sensorCount || 0) > 0
  const gps = trip.gpsLocation?.lat != null && trip.gpsLocation?.lng != null
    ? `${trip.gpsLocation.lat.toFixed(4)}, ${trip.gpsLocation.lng.toFixed(4)}`
    : null

  const uploadMutation = useMutation({
    mutationFn: (readings) => api.post(`/trips/${tripId}/sensor-data/upload`, { readings }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['trips', projectId] })
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] })
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: ['sensor', tripId] })
      toast.success(`${res.data?.count} readings uploaded`)
      setParsed(null)
      setPendingUpload(null)
      if (fileRef.current) fileRef.current.value = ''
    },
    onError: (err) => toast.error(err?.message || 'Upload failed'),
  })

  const clearMutation = useMutation({
    mutationFn: () => api.delete(`/trips/${tripId}/sensor-data`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips', projectId] })
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] })
      queryClient.invalidateQueries({ queryKey: ['sensor', tripId] })
      toast.success('Sensor data cleared')
      setShowClearConfirm(false)
      setParsed(null)
      if (fileRef.current) fileRef.current.value = ''
    },
    onError: (err) => toast.error(err?.message || 'Clear failed'),
  })

  const doUpload = (readings) => {
    const first = readings[0]
    const lat = parseFloat(first?.lat)
    const lng = parseFloat(first?.lng)
    const hasGps = !isNaN(lat) && !isNaN(lng)
    const refLat = projectGpsLocation?.lat
    const refLng = projectGpsLocation?.lng

    if (hasGps && refLat != null && refLng != null) {
      const dist = Math.round(haversineKm(refLat, refLng, lat, lng))
      if (dist > 50) {
        setPendingUpload({ readings, distanceKm: dist })
        return
      }
    }
    uploadMutation.mutate(readings)
  }

  const handleFile = async (file) => {
    if (!file) return
    setParseError('')
    setParsed(null)
    // Use trip startTime as the base date for GCS time-only timestamps
    const baseDate = trip.startTime
      ? new Date(trip.startTime).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
    try {
      const result = await parseFile(file, baseDate)
      setParsed({ ...result, fileName: file.name })
    } catch (err) {
      setParseError(err.message)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md border border-border">

        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Sensor Data</h2>
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">{trip.title}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {hasData && (
            <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 size={13} className="text-green-600 dark:text-green-400 shrink-0" />
                <span className="text-foreground font-medium">{trip.sensorCount.toLocaleString()} readings</span>
                {gps && <span className="text-muted-foreground">· {gps}</span>}
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={clearMutation.isPending}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={11} /> Clear
              </button>
            </div>
          )}

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {hasData ? 'Drop file to replace' : 'Drop CSV or JSON'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {parsed && (
            <div className="bg-muted rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-foreground truncate max-w-[160px]">{parsed.fileName}</p>
                  {parsed.format === 'gcs' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">GCS</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {parsed.readings.length.toLocaleString()} readings
                  {parsed.readings[0]?.lat && parsed.readings[0]?.lng ? ' · GPS ✓' : ''}
                  {parsed.format === 'gcs' && ` · date: ${parsed.readings[0]?.timestamp?.split('T')[0] ?? '?'}`}
                </p>
              </div>
              <button
                onClick={() => doUpload(parsed.readings)}
                disabled={uploadMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
              >
                <Upload size={11} />
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed">
            Hỗ trợ: <span className="font-medium text-foreground">GCS log</span> (Time,Roll,Pitch,Yaw,Depth…) hoặc <span className="font-medium text-foreground">Standard CSV</span> (timestamp,depth,temp[,pressure,lat,lng,…])
          </p>
        </div>
      </div>

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear sensor data?"
          message={`Delete all ${trip.sensorCount.toLocaleString()} readings for "${trip.title}"?`}
          loading={clearMutation.isPending}
          onConfirm={() => clearMutation.mutate()}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {pendingUpload && (
        <ConfirmDialog
          title="GPS location mismatch"
          message={`The GPS coordinates in this file are ${pendingUpload.distanceKm} km away from the project's reference location. This may indicate a wrong file was selected. Upload anyway?`}
          confirmLabel="Upload anyway"
          variant="warning"
          loading={uploadMutation.isPending}
          onConfirm={() => uploadMutation.mutate(pendingUpload.readings)}
          onCancel={() => setPendingUpload(null)}
        />
      )}
    </div>
  )
}
