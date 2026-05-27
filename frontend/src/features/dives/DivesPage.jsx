import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Eye, ExternalLink, Search, X, Anchor, Activity } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import DiveForm from './components/DiveForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import { exportDivesCSV, exportDivesPDF } from '@/lib/export'
import { useDebounce } from '@/hooks/useDebounce'
import EmptyState from '@/components/shared/EmptyState'

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-muted text-muted-foreground' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  done:    { text: 'Done',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
}

const LIMIT = 10

export default function DivesPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [filterTrip, setFilterTrip] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search)

  const { data: divesData, isLoading } = useQuery({
    queryKey: ['dives', { page, search: debouncedSearch, tripId: filterTrip, status: filterStatus, fromDate, toDate }],
    queryFn: () => api.get('/dives', {
      params: { page, limit: LIMIT, search: debouncedSearch || undefined, tripId: filterTrip || undefined, status: filterStatus || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined }
    }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 30000,
  })

  const { data: trips } = useQuery({
    queryKey: ['trips', 'all'],
    queryFn: () => api.get('/trips', { params: { limit: 100 } }).then(r => r.data?.data || [])
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/dives/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dives'] }); toast.success('Dive deleted'); setConfirmDelete(null) },
    onError: () => toast.error('Failed to delete dive')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const dives = divesData?.data || []
  const isEmpty = !isLoading && dives.length === 0

  const hasActiveFilter = filterTrip || filterStatus || fromDate || toDate
  const resetFilters = () => { setFilterTrip(''); setFilterStatus(''); setFromDate(''); setToDate(''); setPage(1) }

  const fetchAllDives = () => api.get('/dives', { params: { limit: 1000, search: debouncedSearch || undefined, tripId: filterTrip || undefined, status: filterStatus || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined } })
  const handleExportCSV = async () => { const res = await fetchAllDives(); exportDivesCSV(res?.data?.data || []) }
  const handleExportPDF = async () => { const res = await fetchAllDives(); exportDivesPDF(res?.data?.data || []) }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Dives</h1>
        <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
      </div>

      {/* Search & filter */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search dive title..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-input bg-background text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
          </div>
          <div className="flex gap-2">
            <select value={filterTrip} onChange={e => { setFilterTrip(e.target.value); setPage(1) }}
              className="flex-1 sm:flex-none border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Trips</option>
              {trips?.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
              className="flex-1 sm:flex-none border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">Created:</span>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }}
              className="border border-input bg-background text-foreground rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring flex-1 sm:flex-none min-w-0" />
            <span className="text-xs text-muted-foreground shrink-0">→</span>
            <input type="date" value={toDate} min={fromDate} onChange={e => { setToDate(e.target.value); setPage(1) }}
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
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : isEmpty ? (
        <EmptyState icon={Anchor} title="No dives found" description="Dives are created inside each trip." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-card rounded-xl shadow overflow-hidden border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">Title</th>
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">Trip</th>
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">Sensor Data</th>
                  <th className="text-right px-6 py-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dives.map(dive => {
                  const { text, cls } = STATUS[dive.status] || STATUS.pending
                  return (
                    <tr key={dive._id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <Link to={`/dives/${dive._id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                          {dive.title}
                        </Link>
                        {dive.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{dive.description}</p>}
                      </td>
                      <td className="px-6 py-4">
                        {dive.trip ? (
                          <Link to={`/trips/${dive.trip._id}`}
                            className="flex items-center gap-1 text-primary hover:underline text-xs">
                            {dive.trip.name} <ExternalLink size={11} />
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      </td>
                      <td className="px-6 py-4">
                        {(dive.sensorCount || 0) > 0 ? (
                          <div>
                            <div className="flex items-center gap-1 text-xs text-primary">
                              <Activity size={11} />
                              <span className="font-medium">{dive.sensorCount.toLocaleString()} readings</span>
                            </div>
                            {dive.locationName && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">{dive.locationName}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/dives/${dive._id}`} title="View dive details"
                            className="p-1.5 text-muted-foreground hover:text-primary rounded transition-colors">
                            <Eye size={15} />
                          </Link>
                          {canEdit && (
                            <button onClick={() => setEditing(dive)}
                              className="p-1.5 text-muted-foreground hover:text-yellow-500 rounded transition-colors">
                              <Pencil size={15} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setConfirmDelete(dive)}
                              className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-2">
            {dives.map(dive => {
              const { text, cls } = STATUS[dive.status] || STATUS.pending
              return (
                <div key={dive._id} className="bg-card rounded-xl border border-border shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link to={`/dives/${dive._id}`} className="font-semibold text-foreground text-sm hover:text-primary transition-colors">
                          {dive.title}
                        </Link>
                      {dive.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{dive.description}</p>}
                      {dive.trip && (
                        <Link to={`/trips/${dive.trip._id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary mt-1 hover:underline">
                          {dive.trip.name} <ExternalLink size={10} />
                        </Link>
                      )}
                      {(dive.sensorCount || 0) > 0 && (
                        <div className="flex items-center gap-1 text-xs text-primary mt-1">
                          <Activity size={11} />
                          <span>{dive.sensorCount.toLocaleString()} readings</span>
                          {dive.locationName && <span className="text-muted-foreground truncate max-w-[140px]" title={dive.locationName}>· {dive.locationName}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      <Link to={`/dives/${dive._id}`} title="View details"
                        className="p-1.5 text-muted-foreground hover:text-primary rounded transition-colors">
                        <Eye size={14} />
                      </Link>
                      {canEdit && (
                        <button onClick={() => setEditing(dive)}
                          className="p-1.5 text-muted-foreground hover:text-yellow-500 rounded transition-colors">
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setConfirmDelete(dive)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <Pagination
            page={divesData.page} totalPages={divesData.totalPages}
            total={divesData.total} limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      {editing && (
        <DiveForm tripId={editing.trip?._id} diveData={editing} onClose={() => setEditing(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Dive"
          message={`Are you sure you want to delete "${confirmDelete.title}"?`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
