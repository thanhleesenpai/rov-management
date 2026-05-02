import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Map, Clock, CheckCircle2, Anchor, MapPin, Eye } from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import RovForm from './components/RovForm'
import { Skeleton } from '@/components/shared/Skeleton'

const STATUS_LABEL = {
  active:      { text: 'Active',      cls: 'bg-green-100 text-green-700' },
  maintenance: { text: 'Maintenance', cls: 'bg-yellow-100 text-yellow-700' },
  retired:     { text: 'Retired',     cls: 'bg-gray-200 text-gray-600' }
}

const TRIP_STATUS = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700' },
  completed: { text: 'Completed', cls: 'bg-gray-200 text-gray-600' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600' }
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-500' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-500' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-500' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center shrink-0`}>
          <Icon size={16} className={c.icon} />
        </div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="font-bold text-gray-800 text-lg leading-tight">{value ?? '—'}</p>
        </div>
      </div>
    </div>
  )
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
  const ongoingTrips = trips.filter(t => t.status === 'ongoing').length

  if (isLoading) return (
    <div className="max-w-3xl space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  )
  if (isError || !rov) return <div className="text-red-500">ROV not found.</div>

  const { text, cls } = STATUS_LABEL[rov.status] || STATUS_LABEL.active

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate('/rovs')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6">
        <ArrowLeft size={16} /> Back to ROVs
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl shadow p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">{rov.name}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{rov.model}</p>
          </div>
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-400 text-xs mb-1">Serial Number</p>
            <p className="font-mono font-medium text-gray-800">{rov.serialNumber}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-400 text-xs mb-1">Registered</p>
            <p className="text-gray-800">{new Date(rov.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {rov.specs && Object.keys(rov.specs).length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">Specs</p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {Object.entries(rov.specs).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-400 capitalize shrink-0">{k}:</span>
                  <span className="text-gray-800 font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rov.notes && (
          <div className="mt-4 pt-4 border-t text-sm text-gray-600 whitespace-pre-wrap">{rov.notes}</div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Map}          label="Total Trips"     value={tripsLoading ? '…' : trips.length}          color="blue" />
        <StatCard icon={CheckCircle2} label="Completed"       value={tripsLoading ? '…' : completedTrips}        color="green" />
        <StatCard icon={Anchor}       label="Active Now"      value={tripsLoading ? '…' : ongoingTrips}          color="orange" />
        <StatCard icon={Clock}        label="Total Hours"     value={tripsLoading ? '…' : calcTotalHours(trips)}  color="purple" />
      </div>

      {/* Trip history */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Trip History</h2>

        {tripsLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No trips recorded for this ROV.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {trips.map(trip => {
              const ts = TRIP_STATUS[trip.status] || TRIP_STATUS.planned
              return (
                <div key={trip._id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${ts.cls}`}>{ts.text}</span>
                      <span className="text-sm font-medium text-gray-800 truncate">{trip.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
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
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded shrink-0" title="View trip">
                    <Eye size={15} />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && <RovForm rovData={rov} onClose={() => setShowForm(false)} />}
    </div>
  )
}
