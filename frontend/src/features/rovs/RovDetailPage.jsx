import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Map, Clock, CheckCircle2, Anchor, MapPin, Eye } from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import RovForm from './components/RovForm'
import { Skeleton } from '@/components/shared/Skeleton'

const STATUS_LABEL = {
  active:      { text: 'Active',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  maintenance: { text: 'Maintenance', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  retired:     { text: 'Retired',     cls: 'bg-muted text-muted-foreground' }
}

const TRIP_STATUS = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  completed: { text: 'Completed', cls: 'bg-muted text-muted-foreground' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' }
}

function calcTotalHours(trips) {
  let ms = 0
  trips.forEach(t => {
    if (t.startTime && t.endTime) ms += new Date(t.endTime) - new Date(t.startTime)
  })
  const h = ms / 3600000
  return h > 0 ? `${h.toFixed(1)}h` : '—'
}

export default function RovDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)

  const { data: rov, isLoading, isError } = useQuery({
    queryKey: ['rovs', id],
    queryFn: () => api.get(`/rovs/${id}`).then(r => r.data)
  })

  const { data: tripsData, isLoading: tripsLoading } = useQuery({
    queryKey: ['trips', { rovId: id }],
    queryFn: () => api.get('/trips', { params: { rovId: id, limit: 100 } }).then(r => r.data),
    enabled: !!id
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const trips = tripsData?.data || []
  const completedTrips = trips.filter(t => t.status === 'completed').length
  const ongoingTrips   = trips.filter(t => t.status === 'ongoing').length

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
  if (isError || !rov) return <div className="text-destructive">ROV not found.</div>

  const { text, cls } = STATUS_LABEL[rov.status] || STATUS_LABEL.active

  return (
    <div>
      <button onClick={() => navigate('/rovs')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to ROVs
      </button>

      <div className="bg-card rounded-xl shadow border border-border p-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{rov.name}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{rov.model}</p>
          </div>
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        {/* ── Info grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-6">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-muted-foreground text-xs mb-1">Serial Number</p>
            <p className="font-mono font-medium text-foreground">{rov.serialNumber}</p>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-muted-foreground text-xs mb-1">Registered</p>
            <p className="text-foreground">{new Date(rov.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {rov.specs && Object.keys(rov.specs).length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-muted-foreground mb-2">Specs</p>
            <div className="bg-muted rounded-lg p-4 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {Object.entries(rov.specs).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-muted-foreground capitalize shrink-0">{k}:</span>
                  <span className="text-foreground font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rov.notes && (
          <div className="mb-6 pt-4 border-t border-border text-sm text-muted-foreground whitespace-pre-wrap">
            {rov.notes}
          </div>
        )}

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 pt-4 border-t border-border">
          {[
            { icon: Map,          label: 'Total Trips',  value: tripsLoading ? '…' : trips.length,          color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { icon: CheckCircle2, label: 'Completed',    value: tripsLoading ? '…' : completedTrips,        color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20' },
            { icon: Anchor,       label: 'Active Now',   value: tripsLoading ? '…' : ongoingTrips,          color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
            { icon: Clock,        label: 'Total Hours',  value: tripsLoading ? '…' : calcTotalHours(trips), color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-muted rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <Icon size={16} className={color} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-bold text-foreground text-lg leading-tight">{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Trip history ── */}
        <div className="pt-4 border-t border-border">
          <h2 className="text-sm font-semibold text-foreground mb-4">Trip History</h2>

          {tripsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No trips recorded for this ROV.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {trips.map(trip => {
                const ts = TRIP_STATUS[trip.status] || TRIP_STATUS.planned
                return (
                  <div key={trip._id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${ts.cls}`}>
                          {ts.text}
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">Trip: {trip.name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {trip.location && (
                          <span className="flex items-center gap-1"><MapPin size={10} />{trip.location}</span>
                        )}
                        {trip.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(trip.startTime).toLocaleDateString()}
                            {trip.endTime && ` → ${new Date(trip.endTime).toLocaleDateString()}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link to={`/trips/${trip._id}`}
                      className="p-1.5 text-muted-foreground hover:text-primary rounded shrink-0 transition-colors"
                      title="View trip">
                      <Eye size={15} />
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
          Created {new Date(rov.createdAt).toLocaleDateString()}
        </div>
      </div>

      {showForm && <RovForm rovData={rov} onClose={() => setShowForm(false)} />}
    </div>
  )
}
