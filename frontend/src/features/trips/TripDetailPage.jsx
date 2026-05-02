import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, MapPin, Clock, Anchor } from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import JobList from '@/features/jobs/JobList'

const STATUS = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700' },
  completed: { text: 'Completed', cls: 'bg-gray-200 text-gray-600' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600' }
}

export default function TripDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)

  const { data: trip, isLoading, isError } = useQuery({
    queryKey: ['trips', id],
    queryFn: () => api.get(`/trips/${id}`).then(r => r.data),
    refetchInterval: 30000,
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)

  if (isLoading) return <div className="text-gray-500">Loading...</div>
  if (isError || !trip) return <div className="text-red-500">Trip not found.</div>

  const { text, cls } = STATUS[trip.status] || STATUS.planned

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/trips')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6">
        <ArrowLeft size={16} /> Back to Trips
      </button>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">{trip.name}</h1>
            {trip.description && <p className="text-gray-500 text-sm mt-1">{trip.description}</p>}
          </div>
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-4 flex gap-3">
            <Anchor size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-gray-400 text-xs mb-0.5">ROV</p>
              <p className="font-medium text-gray-800">{trip.rov?.name || '—'}</p>
              <p className="text-xs text-gray-400">{trip.rov?.model}</p>
            </div>
          </div>

          {trip.location && (
            <div className="bg-gray-50 rounded-lg p-4 flex gap-3">
              <MapPin size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Location</p>
                <p className="font-medium text-gray-800">{trip.location}</p>
              </div>
            </div>
          )}

          {trip.startTime && (
            <div className="bg-gray-50 rounded-lg p-4 flex gap-3">
              <Clock size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-gray-400 text-xs mb-0.5">Start Time</p>
                <p className="font-medium text-gray-800">{new Date(trip.startTime).toLocaleString()}</p>
              </div>
            </div>
          )}

          {trip.endTime && (
            <div className="bg-gray-50 rounded-lg p-4 flex gap-3">
              <Clock size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-gray-400 text-xs mb-0.5">End Time</p>
                <p className="font-medium text-gray-800">{new Date(trip.endTime).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t text-xs text-gray-400">
          Created by {trip.createdBy?.fullName} · {new Date(trip.createdAt).toLocaleDateString()}
        </div>

        <JobList tripId={trip._id} />
      </div>

      {showForm && <TripForm tripData={trip} onClose={() => setShowForm(false)} />}
    </div>
  )
}
