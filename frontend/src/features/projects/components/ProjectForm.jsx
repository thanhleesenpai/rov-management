import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, MapPin, Loader2, Map as MapIcon } from 'lucide-react'
import { toast } from 'sonner'
import 'leaflet/dist/leaflet.css'
import api from '@/lib/axios'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

function MapPickerModal({ initLat, initLng, onSelect, onClose }) {
  const mapRef = useRef(null)
  const inst = useRef(null)
  const markerRef = useRef(null)
  const selectedPos = useRef({ lat: initLat || 16.05, lng: initLng || 108.22 })

  useEffect(() => {
    if (!mapRef.current || inst.current) return
    let active = true
    import('leaflet').then(({ default: L }) => {
      if (!active || inst.current) return
      const map = L.map(mapRef.current).setView([selectedPos.current.lat, selectedPos.current.lng], 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

      const marker = L.marker([selectedPos.current.lat, selectedPos.current.lng]).addTo(map)
      markerRef.current = marker

      map.on('click', (e) => {
        selectedPos.current = { lat: e.latlng.lat, lng: e.latlng.lng }
        marker.setLatLng(e.latlng)
      })

      inst.current = map
    })
    return () => {
      active = false
      if (inst.current) { inst.current.remove(); inst.current = null }
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-2xl rounded-xl shadow-xl border border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <h3 className="font-semibold text-foreground">Select Location</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="h-[50vh] w-full z-0 relative" ref={mapRef} />
        <div className="p-4 border-t border-border flex items-center justify-between bg-muted/30">
          <p className="text-xs text-muted-foreground">Click anywhere on the map to place the pin.</p>
          <div className="flex gap-2">
            <MarineButton type="button" variant="outline" onClick={onClose}>Cancel</MarineButton>
            <MarineButton type="button" variant="solid" onClick={() => onSelect(selectedPos.current)}>Confirm Location</MarineButton>
          </div>
        </div>
      </div>
    </div>
  )
}
import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineButton } from '@/components/bespoke/MarineButton'
import { MarineInput } from '@/components/bespoke/MarineInput'
import { MarineTextarea } from '@/components/bespoke/MarineTextarea'
import { MarineDatePicker } from '@/components/bespoke/MarineDatePicker'

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
  const [showMap, setShowMap] = useState(false)
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
      <MarineInput
        value={query}
        onChange={e => handleInput(e.target.value)}
        placeholder="Search or paste coordinates (16.05, 108.22)"
        autoComplete="off"
      />

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {loading && <Loader2 size={12} className="animate-spin text-muted-foreground pointer-events-none" />}
        {!loading && hasCoords && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 pointer-events-none mr-1">
            <MapPin size={11} />
            {gpsLocation.lat.toFixed(4)}, {gpsLocation.lng.toFixed(4)}
          </span>
        )}
        <button type="button" onClick={() => setShowMap(true)} 
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors" title="Pick from map">
          <MapIcon size={14} />
        </button>
      </div>

      {showMap && (
        <MapPickerModal
          initLat={gpsLocation?.lat}
          initLng={gpsLocation?.lng}
          onClose={() => setShowMap(false)}
          onSelect={({ lat, lng }) => {
            const newName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
            setQuery(newName)
            onChange({ name: newName, lat, lng })
            setShowMap(false)
          }}
        />
      )}

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

export default function ProjectForm({ projectData, onClose }) {
  const queryClient = useQueryClient()
  const isEdit = !!projectData

  const [form, setForm] = useState({
    name: projectData?.name || '',
    description: projectData?.description || '',
    rov: projectData?.rov?._id || projectData?.rov || '',
    startTime: projectData?.startTime ? projectData.startTime.slice(0, 16) : '',
    endTime: projectData?.endTime ? projectData.endTime.slice(0, 16) : '',
    status: projectData?.status || 'planned',
  })

  const [locationData, setLocationData] = useState({
    name: projectData?.locationName || projectData?.location || '',
    lat: projectData?.gpsLocation?.lat ?? null,
    lng: projectData?.gpsLocation?.lng ?? null,
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
      isEdit ? api.patch(`/projects/${projectData._id}`, data) : api.post('/projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success(isEdit ? 'Project updated' : 'Project created')
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
      const origLat = projectData?.gpsLocation?.lat
      const origLng = projectData?.gpsLocation?.lng
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground">{isEdit ? 'Edit Project' : 'New Project'}</h2>
          <MarineButton variant="icon" icon={X} onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

          {field('Project Name', (
            <MarineInput type="text" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          ))}

          {field('ROV', (
            <MarineSelect value={form.rov} onChange={e => setForm(f => ({ ...f, rov: e.target.value }))}>
              <option value="">-- Select ROV --</option>
              {rovs.map(r => (
                <option key={r._id} value={r._id}>{r.name} ({r.model})</option>
              ))}
            </MarineSelect>
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
              <MarineDatePicker value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            ))}
            {field('End Time', (
              <MarineDatePicker value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            ))}
          </div>

          {field('Status', (
            <MarineSelect value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="planned">Planned</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </MarineSelect>
          ))}

          {field('Description', (
            <MarineTextarea value={form.description} rows={3}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <MarineButton variant="outline" type="button" onClick={onClose}>
              Cancel
            </MarineButton>
            <MarineButton variant="solid" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
            </MarineButton>
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
