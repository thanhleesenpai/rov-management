import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, MapPin, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

const inputCls = 'w-full border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground'

const COORD_RE = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/
const LOCATION_WARN_KM = 100

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function LocationSearch({ name, gpsLocation, onChange }) {
  const [query, setQuery] = useState(name || '')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef()
  const containerRef = useRef()

  useEffect(() => {
    setQuery(name || '')
  }, [name])

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = (val) => {
    setQuery(val)
    clearTimeout(debounceRef.current)

    // Coordinate paste detection
    const match = val.trim().match(COORD_RE)
    if (match) {
      const lat = parseFloat(match[1])
      const lng = parseFloat(match[2])
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        onChange({ name: val.trim(), lat, lng })
        setSuggestions([])
        setOpen(false)
        return
      }
    }

    // Clear GPS while typing non-coord text
    onChange({ name: val, lat: null, lng: null })

    if (val.trim().length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5`,
          { headers: { 'User-Agent': 'ROV-Management/1.0 (thanhle20072004@gmail.com)' } }
        )
        const data = await res.json()
        setSuggestions(data)
        setOpen(data.length > 0)
      } catch { /* network error — stay silent */ }
      setLoading(false)
    }, 400)
  }

  const select = (item) => {
    const n = item.display_name
    setQuery(n)
    onChange({ name: n, lat: parseFloat(item.lat), lng: parseFloat(item.lon) })
    setOpen(false)
    setSuggestions([])
  }

  const hasCoords = gpsLocation?.lat != null && gpsLocation?.lng != null

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={e => handleInput(e.target.value)}
        placeholder="Search or paste coordinates (16.05, 108.22)"
        className={inputCls}
        autoComplete="off"
      />

      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
        {loading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        {!loading && hasCoords && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <MapPin size={11} />
            {gpsLocation.lat.toFixed(4)}, {gpsLocation.lng.toFixed(4)}
          </span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {suggestions.map(item => (
            <li key={item.place_id}>
              <button
                type="button"
                onClick={() => select(item)}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors truncate"
              >
                {item.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function TripForm({ tripData, onClose }) {
  const queryClient = useQueryClient()
  const isEdit = !!tripData

  const [form, setForm] = useState({
    name: tripData?.name || '',
    description: tripData?.description || '',
    rov: tripData?.rov?._id || tripData?.rov || '',
    startTime: tripData?.startTime ? tripData.startTime.slice(0, 16) : '',
    endTime: tripData?.endTime ? tripData.endTime.slice(0, 16) : '',
    status: tripData?.status || 'planned',
  })

  const [locationData, setLocationData] = useState({
    name: tripData?.locationName || tripData?.location || '',
    lat: tripData?.gpsLocation?.lat ?? null,
    lng: tripData?.gpsLocation?.lng ?? null,
  })

  const [error, setError] = useState('')
  const [pendingSave, setPendingSave] = useState(null)

  const { data: rovsRes } = useQuery({
    queryKey: ['rovs', 'active'],
    queryFn: () => api.get('/rovs', { params: { limit: 100, status: 'active' } }).then(r => r.data)
  })
  const rovs = rovsRes?.data || []

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit ? api.patch(`/trips/${tripData._id}`, data) : api.post('/trips', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.success(isEdit ? 'Trip updated' : 'Trip created')
      onClose()
    },
    onError: (err) => setError(err.message || 'Something went wrong')
  })

  const buildPayload = () => ({
    ...form,
    location: locationData.name,
    locationName: locationData.name,
    gpsLocation: { lat: locationData.lat, lng: locationData.lng },
    startTime: form.startTime || null,
    endTime: form.endTime || null,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    // Warn if editing and new location is far from original
    if (isEdit && locationData.lat != null) {
      const origLat = tripData?.gpsLocation?.lat
      const origLng = tripData?.gpsLocation?.lng
      if (origLat != null && origLng != null) {
        const dist = Math.round(haversineKm(origLat, origLng, locationData.lat, locationData.lng))
        if (dist > LOCATION_WARN_KM) {
          setPendingSave({ payload: buildPayload(), distanceKm: dist })
          return
        }
      }
    }
    mutation.mutate(buildPayload())
  }

  const field = (label, children) => (
    <div><label className="block text-sm font-medium text-foreground mb-1">{label}</label>{children}</div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground">{isEdit ? 'Edit Trip' : 'New Trip'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

          {field('Trip Name', (
            <input type="text" required value={form.name} className={inputCls}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          ))}

          {field('ROV', (
            <select required value={form.rov} className={inputCls}
              onChange={e => setForm(f => ({ ...f, rov: e.target.value }))}>
              <option value="">-- Select ROV --</option>
              {rovs.map(r => (
                <option key={r._id} value={r._id}>{r.name} ({r.model})</option>
              ))}
            </select>
          ))}

          {field('Location', (
            <LocationSearch
              name={locationData.name}
              gpsLocation={locationData}
              onChange={({ name, lat, lng }) => setLocationData({ name, lat, lng })}
            />
          ))}

          <div className="grid grid-cols-2 gap-4">
            {field('Start Time', (
              <input type="datetime-local" value={form.startTime} className={inputCls}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            ))}
            {field('End Time', (
              <input type="datetime-local" value={form.endTime} className={inputCls}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            ))}
          </div>

          {field('Status', (
            <select value={form.status} className={inputCls}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="planned">Planned</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ))}

          {field('Description', (
            <textarea value={form.description} rows={3} className={`${inputCls} resize-none`}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>

      {pendingSave && (
        <ConfirmDialog
          title="Location changed significantly"
          message={`New location is ${pendingSave.distanceKm} km away from the original. Jobs with uploaded sensor data may show GPS distance warnings. Save anyway?`}
          confirmLabel="Save anyway"
          variant="warning"
          loading={mutation.isPending}
          onConfirm={() => { mutation.mutate(pendingSave.payload); setPendingSave(null) }}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </div>
  )
}
