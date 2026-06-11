import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Eye, PenLine, Trash, MapPin, Clock, Search, X, Map, ChevronRight, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import { CardSkeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import EmptyState from '@/components/shared/EmptyState'
import { MarineInput } from '@/components/bespoke/MarineInput'
import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineDatePicker } from '@/components/bespoke/MarineDatePicker'
import {
  MarineTable, MarineTableHeader, MarineTableBody,
  MarineTableRow, MarineTableHead, MarineTableCell, MarineTableStatus,
  MarineTableActionMenu, MarineTableActionItem
} from '@/components/bespoke/MarineTable'
import { MarineButton } from '@/components/bespoke/MarineButton'
import { exportTripsCSV, exportTripsPDF } from '@/lib/export'
import { useDebounce } from '@/hooks/useDebounce'

const STATUS = {
  planned: { text: 'Planned', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ongoing: { text: 'Ongoing', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  completed: { text: 'Completed', cls: 'bg-muted text-muted-foreground' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' }
}

const LIMIT = 10

export default function TripsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
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
    queryFn: () => api.get('/trips', {
      params: {
        page, limit: LIMIT,
        search: debouncedSearch || undefined,
        status: filterStatus || undefined,
        rovId: filterRov || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }
    }).then(r => r.data),
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

  const fetchAllTrips = () => api.get('/trips', {
    params: {
      limit: 1000,
      search: debouncedSearch || undefined,
      status: filterStatus || undefined,
      rovId: filterRov || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }
  })
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
            <MarineButton variant="solid" icon={Plus} onClick={() => setShowForm(true)} className="max-sm:w-9 max-sm:px-0">
              <span className="hidden sm:inline">New Trip</span>
            </MarineButton>
          )}
        </div>
      </div>

      {/* Search & filter */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 mx-0 md:mx-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <MarineInput
              placeholder="Search name, location..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 pr-3 w-full"
            />
          </div>
          <div className="flex gap-2">
            <div className="w-32 shrink-0">
              <MarineSelect value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
                <option value="">All Status</option>
                <option value="planned">Planned</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </MarineSelect>
            </div>
            <div className="w-32 shrink-0">
              <MarineSelect value={filterRov} onChange={e => { setFilterRov(e.target.value); setPage(1) }}>
                <option value="">All ROVs</option>
                {rovList?.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
              </MarineSelect>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0 mr-1 mt-0.5">START DATE:</span>
            <MarineDatePicker value={fromDate} onChange={e => { setFromDate(e.target.value); resetPage() }} className="w-full sm:w-[120px]" />
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0 hidden sm:block" />
            <MarineDatePicker value={toDate} min={fromDate} onChange={e => { setToDate(e.target.value); resetPage() }} className="w-full sm:w-[120px]" />
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
            ? <MarineButton variant="solid" onClick={() => setShowForm(true)}>Create Trip</MarineButton>
            : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden xl:block">
            <MarineTable>
              <MarineTableHeader>
                <MarineTableRow>
                  <MarineTableHead>Name</MarineTableHead>
                  <MarineTableHead>ROV</MarineTableHead>
                  <MarineTableHead>Location</MarineTableHead>
                  <MarineTableHead>Dates</MarineTableHead>
                  <MarineTableHead>Status</MarineTableHead>
                  <MarineTableHead align="right">Actions</MarineTableHead>
                </MarineTableRow>
              </MarineTableHeader>
              <MarineTableBody>
                {trips.map(trip => {
                  return (
                    <MarineTableRow key={trip._id} onClick={() => navigate(`/trips/${trip._id}`)}>
                      <MarineTableCell>
                        <Link to={`/trips/${trip._id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-foreground hover:text-cyan-600 transition-colors truncate block w-fit">
                          {trip.name}
                        </Link>
                        {trip.description && <p className="text-xs text-muted-foreground font-normal mt-0.5 truncate max-w-sm" title={trip.description}>{trip.description}</p>}
                      </MarineTableCell>
                      <MarineTableCell>
                        {trip.rov ? (
                          <Link to={`/rovs/${trip.rov._id}`} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer truncate"
                            title={trip.rov.name}>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">ROV</span>
                            <span className="text-sm font-mono text-foreground">{trip.rov.name.replace(/^ROV\s+/i, '')}</span>
                          </Link>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        {trip.location ? (
                          <span className="truncate max-w-xs block" title={trip.location}>{trip.location}</span>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell isMono>
                        {trip.startTime ? (
                          <span title={trip.endTime ? `${new Date(trip.startTime).toLocaleDateString()} → ${new Date(trip.endTime).toLocaleDateString()}` : new Date(trip.startTime).toLocaleDateString()}>
                            {new Date(trip.startTime).toLocaleDateString()}
                            {trip.endTime && ` → ${new Date(trip.endTime).toLocaleDateString()}`}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        <MarineTableStatus status={trip.status} label={STATUS[trip.status]?.text || 'Unknown'} />
                      </MarineTableCell>
                      <MarineTableCell align="right">
                        <div className="flex items-center justify-end gap-3">
                          <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                          {(canEdit || canDelete) && (
                            <MarineTableActionMenu>
                              {canEdit && (
                                <MarineTableActionItem onClick={() => { setEditing(trip); setShowForm(true) }}>
                                  <PenLine size={14} /> Edit
                                </MarineTableActionItem>
                              )}
                              {canDelete && (
                                <MarineTableActionItem onClick={() => setConfirmDelete(trip)} isDanger>
                                  <Trash size={14} /> Delete
                                </MarineTableActionItem>
                              )}
                            </MarineTableActionMenu>
                          )}
                        </div>
                      </MarineTableCell>
                    </MarineTableRow>
                  )
                })}
              </MarineTableBody>
            </MarineTable>
          </div>

          {/* Mobile card list */}
          <div className="xl:hidden space-y-2">
            {trips.map(trip => {
              return (
                <div key={trip._id} onClick={() => navigate(`/trips/${trip._id}`)}
                  className="bg-card rounded-lg border border-border shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[200px] sm:max-w-xs">
                          {trip.name}
                        </span>
                        <MarineTableStatus status={trip.status} label={STATUS[trip.status]?.text || 'Unknown'} />
                      </div>

                      {trip.description && <p className="text-xs text-muted-foreground font-normal line-clamp-2">{trip.description}</p>}

                      <div className="flex flex-col gap-1.5 mt-2">
                        {trip.rov && (
                          <div onClick={e => { e.stopPropagation(); navigate(`/rovs/${trip.rov._id}`) }}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer w-fit">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">ROV</span>
                            <span className="text-sm font-mono text-foreground">{trip.rov.name.replace(/^ROV\s+/i, '')}</span>
                          </div>
                        )}

                        {(trip.location || trip.startTime) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {trip.location && (
                              <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                                <MapPin size={11} className="shrink-0 text-muted-foreground" />
                                <span className="truncate max-w-[120px]">{trip.location}</span>
                              </div>
                            )}
                            {trip.startTime && (
                              <div className="flex items-center gap-1 text-sm font-mono text-foreground">
                                <Clock size={11} className="shrink-0 text-muted-foreground" />
                                <span>
                                  {new Date(trip.startTime).toLocaleDateString()}
                                  {trip.endTime && ` → ${new Date(trip.endTime).toLocaleDateString()}`}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pl-2">
                      <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                      {(canEdit || canDelete) && (
                        <div onClick={e => e.stopPropagation()}>
                          <MarineTableActionMenu>
                            {canEdit && (
                              <MarineTableActionItem onClick={() => { setEditing(trip); setShowForm(true) }}>
                                <PenLine size={14} /> Edit
                              </MarineTableActionItem>
                            )}
                            {canDelete && (
                              <MarineTableActionItem onClick={() => setConfirmDelete(trip)} isDanger>
                                <Trash size={14} /> Delete
                              </MarineTableActionItem>
                            )}
                          </MarineTableActionMenu>
                        </div>
                      )}
                    </div>
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
          message={`Are you sure you want to delete "${confirmDelete.name}"?\n\n⚠️ WARNING: All associated dives in this trip will also be deleted. This action cannot be undone.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
