import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Eye, Pencil, Trash2, MapPin, Clock, Search, X, Map } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import { CardSkeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import EmptyState from '@/components/shared/EmptyState'
import { exportTripsCSV, exportTripsPDF } from '@/lib/export'
import { useDebounce } from '@/hooks/useDebounce'

const STATUS = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  completed: { text: 'Completed', cls: 'bg-muted text-muted-foreground' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' }
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
  const [filterRov, setFilterRov] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search)

  const { data, isLoading } = useQuery({
    queryKey: ['trips', { page, search: debouncedSearch, status: filterStatus, rovId: filterRov, fromDate, toDate }],
    queryFn: () => api.get('/trips', { params: {
      page, limit: LIMIT,
      search: debouncedSearch || undefined,
      status: filterStatus || undefined,
      rovId: filterRov || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }}).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 60000,
  })

  const { data: rovList } = useQuery({
    queryKey: ['rovs', 'all'],
    queryFn: () => api.get('/rovs', { params: { limit: 100 } }).then(r => r.data?.data || [])
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

  const hasActiveFilter = filterStatus || filterRov || fromDate || toDate
  const resetFilters = () => { setFilterStatus(''); setFilterRov(''); setFromDate(''); setToDate(''); setPage(1) }
  const resetPage = () => setPage(1)

  const fetchAllTrips = () => api.get('/trips', { params: {
    limit: 1000,
    search: debouncedSearch || undefined,
    status: filterStatus || undefined,
    rovId: filterRov || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  }})
  const handleExportCSV = async () => { const res = await fetchAllTrips(); exportTripsCSV(res?.data?.data || []) }
  const handleExportPDF = async () => { const res = await fetchAllTrips(); exportTripsPDF(res?.data?.data || []) }

  const trips = data?.data || []
  const isEmpty = !isLoading && trips.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Trips</h1>
        <div className="flex items-center gap-2">
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 sm:px-4 rounded-lg hover:bg-primary/90 transition-colors text-sm">
              <Plus size={16} /> <span className="hidden sm:inline">New Trip</span><span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & filters */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search name, location..."
              value={search} onChange={e => { setSearch(e.target.value); resetPage() }}
              className="w-full pl-9 pr-3 py-2 border border-input bg-background text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
          </div>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); resetPage() }}
            className="border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Status</option>
            <option value="planned">Planned</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={filterRov} onChange={e => { setFilterRov(e.target.value); resetPage() }}
            className="border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All ROVs</option>
            {rovList?.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">Start date:</span>
            <input type="date" value={fromDate}
              onChange={e => { setFromDate(e.target.value); resetPage() }}
              className="border border-input bg-background text-foreground rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring flex-1 sm:flex-none min-w-0" />
            <span className="text-xs text-muted-foreground shrink-0">→</span>
            <input type="date" value={toDate} min={fromDate}
              onChange={e => { setToDate(e.target.value); resetPage() }}
              className="border border-input bg-background text-foreground rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring flex-1 sm:flex-none min-w-0" />
          </div>
          {hasActiveFilter && (
            <button onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:hover:bg-red-900/30 rounded-lg transition-colors">
              <X size={11} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : isEmpty ? (
        <EmptyState
          icon={Map}
          title={search || hasActiveFilter ? 'No trips match your filters' : 'No trips yet'}
          description={!search && !hasActiveFilter && canEdit ? 'Create a trip to start tracking ROV dives.' : undefined}
          action={!search && !hasActiveFilter && canEdit
            ? <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90">Create Trip</button>
            : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4">
            {trips.map(trip => {
              const { text, cls } = STATUS[trip.status] || STATUS.planned
              return (
                <div key={trip._id} className="bg-card rounded-xl shadow border border-border p-5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      <span className="text-xs text-muted-foreground">ROV: {trip.rov?.name || '—'}</span>
                    </div>
                    <h2 className="font-semibold text-foreground truncate">{trip.name}</h2>
                    {trip.description && <p className="text-sm text-muted-foreground mt-1 truncate">{trip.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
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
                    <Link to={`/trips/${trip._id}`} className="p-1.5 text-muted-foreground hover:text-primary rounded transition-colors" title="View">
                      <Eye size={15} />
                    </Link>
                    {canEdit && (
                      <button onClick={() => { setEditing(trip); setShowForm(true) }}
                        className="p-1.5 text-muted-foreground hover:text-yellow-500 rounded transition-colors" title="Edit">
                        <Pencil size={15} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setConfirmDelete(trip)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages}
            total={data.total} limit={LIMIT} onPageChange={setPage} />
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
