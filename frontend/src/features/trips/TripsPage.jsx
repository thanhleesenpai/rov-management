import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Eye, Pencil, Trash2, MapPin, Clock, Search } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import { CardSkeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import { useDebounce } from '@/hooks/useDebounce'

const STATUS = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700' },
  completed: { text: 'Completed', cls: 'bg-gray-200 text-gray-600' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600' }
}

const LIMIT = 10

export default function TripsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search)

  const { data, isLoading } = useQuery({
    queryKey: ['trips', { page, search: debouncedSearch, status: filterStatus }],
    queryFn: () => api.get('/trips', { params: { page, limit: LIMIT, search: debouncedSearch || undefined, status: filterStatus || undefined } }).then(r => r.data),
    keepPreviousData: true
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/trips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.success('Trip deleted')
      setConfirmDelete(null)
    },
    onError: () => toast.error('Failed to delete trip')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const handleClose = () => { setEditing(null); setShowForm(false) }

  const trips = data?.data || []
  const isEmpty = !isLoading && trips.length === 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Trips</h1>
        {canEdit && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={16} /> New Trip
          </button>
        )}
      </div>

      {/* Search & filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Search name, location..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Status</option>
          <option value="planned">Planned</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : isEmpty ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-2">No trips found.</p>
          {canEdit && !search && !filterStatus && (
            <button onClick={() => setShowForm(true)} className="text-blue-600 text-sm hover:underline">Create your first trip</button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {trips.map(trip => {
              const { text, cls } = STATUS[trip.status] || STATUS.planned
              return (
                <div key={trip._id} className="bg-white rounded-xl shadow p-5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      <span className="text-xs text-gray-400">ROV: {trip.rov?.name || '—'}</span>
                    </div>
                    <h2 className="font-semibold text-gray-800 truncate">{trip.name}</h2>
                    {trip.description && <p className="text-sm text-gray-500 mt-1 truncate">{trip.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      {trip.location && <span className="flex items-center gap-1"><MapPin size={11} />{trip.location}</span>}
                      {trip.startTime && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(trip.startTime).toLocaleDateString()}
                          {trip.endTime && ` → ${new Date(trip.endTime).toLocaleDateString()}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link to={`/trips/${trip._id}`} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="View">
                      <Eye size={15} />
                    </Link>
                    {canEdit && (
                      <button onClick={() => { setEditing(trip); setShowForm(true) }}
                        className="p-1.5 text-gray-400 hover:text-yellow-600 rounded" title="Edit">
                        <Pencil size={15} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setConfirmDelete(trip)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination
            page={data.page} totalPages={data.totalPages}
            total={data.total} limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      {showForm && <TripForm tripData={editing} onClose={handleClose} />}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Trip"
          message={`Are you sure you want to delete "${confirmDelete.name}"? All associated jobs will remain.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
