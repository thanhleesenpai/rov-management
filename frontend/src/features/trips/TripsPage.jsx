import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { PenLine, Trash, Eye, ExternalLink, Search, X, Anchor, Activity, ArrowRight, MoreVertical, ChevronRight, Clock } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import { exportTripsCSV, exportTripsPDF } from '@/lib/export'
import { useDebounce } from '@/hooks/useDebounce'
import EmptyState from '@/components/shared/EmptyState'
import { MarineInput } from '@/components/bespoke/MarineInput'
import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineDatePicker } from '@/components/bespoke/MarineDatePicker'
import { 
  MarineTable, MarineTableHeader, MarineTableBody, 
  MarineTableRow, MarineTableHead, MarineTableCell, MarineTableStatus,
  MarineTableActionMenu, MarineTableActionItem
} from '@/components/bespoke/MarineTable'

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-muted text-muted-foreground' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  done:    { text: 'Done',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
}

const LIMIT = 10

export default function TripsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search)

  const { data: tripsData, isLoading } = useQuery({
    queryKey: ['trips', { page, search: debouncedSearch, projectId: filterProject, status: filterStatus, fromDate, toDate }],
    queryFn: () => api.get('/trips', {
      params: { page, limit: LIMIT, search: debouncedSearch || undefined, projectId: filterProject || undefined, status: filterStatus || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined }
    }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 30000,
  })

  const { data: projects } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => api.get('/projects', { params: { limit: 100 } }).then(r => r.data?.data || [])
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/trips/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trips'] }); toast.success('Trip deleted'); setConfirmDelete(null) },
    onError: () => toast.error('Failed to delete trip')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const trips = tripsData?.data || []
  const isEmpty = !isLoading && trips.length === 0

  const hasActiveFilter = filterProject || filterStatus || fromDate || toDate
  const resetFilters = () => { setFilterProject(''); setFilterStatus(''); setFromDate(''); setToDate(''); setPage(1) }

  const fetchAllTrips = () => api.get('/trips', { params: { limit: 1000, search: debouncedSearch || undefined, projectId: filterProject || undefined, status: filterStatus || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined } })
  const handleExportCSV = async () => { const res = await fetchAllTrips(); exportTripsCSV(res?.data?.data || []) }
  const handleExportPDF = async () => { const res = await fetchAllTrips(); exportTripsPDF(res?.data?.data || []) }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Trips</h1>
        <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
      </div>

      {/* Search & filter */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 mx-0 md:mx-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <MarineInput placeholder="Search trip title..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 pr-3 text-sm" />
          </div>
          <div className="flex gap-2">
            <div className="w-32">
              <MarineSelect value={filterProject} onChange={e => { setFilterProject(e.target.value); setPage(1) }} className="text-sm">
                <option value="">All Projects</option>
                {projects?.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </MarineSelect>
            </div>
            <div className="w-32">
              <MarineSelect value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} className="text-sm">
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
              </MarineSelect>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0 mr-1 mt-0.5">CREATED:</span>
            <MarineDatePicker value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }} className="w-full sm:w-[120px]" />
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0 hidden sm:block" />
            <MarineDatePicker value={toDate} min={fromDate} onChange={e => { setToDate(e.target.value); setPage(1) }} className="w-full sm:w-[120px]" />
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
        <EmptyState icon={Anchor} title="No trips found" description="Trips are created inside each project." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden xl:block">
            <MarineTable>
              <MarineTableHeader>
                <MarineTableRow>
                  <MarineTableHead>Title</MarineTableHead>
                  <MarineTableHead>Project</MarineTableHead>
                  <MarineTableHead>Status</MarineTableHead>
                  <MarineTableHead>Created</MarineTableHead>
                  <MarineTableHead>Sensor Data</MarineTableHead>
                  <MarineTableHead align="right">Actions</MarineTableHead>
                </MarineTableRow>
              </MarineTableHeader>
              <MarineTableBody>
                {trips.map(trip => {
                  return (
                    <MarineTableRow key={trip._id} onClick={() => navigate(`/trips/${trip._id}`)}>
                      <MarineTableCell>
                        <Link to={`/trips/${trip._id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-foreground hover:text-cyan-600 transition-colors truncate block w-fit">
                          {trip.title}
                        </Link>
                        {trip.description && <p className="text-xs font-normal text-muted-foreground mt-0.5 truncate max-w-xs" title={trip.description}>{trip.description}</p>}
                      </MarineTableCell>
                      <MarineTableCell>
                        {trip.project ? (
                          <Link to={`/projects/${trip.project._id}`} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer truncate"
                            title={trip.project.name}>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold hidden sm:inline shrink-0">PROJ</span>
                            <span className="text-sm font-mono text-foreground truncate block max-w-[120px] sm:max-w-[200px]">{trip.project.name}</span>
                          </Link>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        <MarineTableStatus status={trip.status} label={STATUS[trip.status]?.text || 'Unknown'} />
                      </MarineTableCell>
                      <MarineTableCell isMono>
                        {new Date(trip.createdAt).toLocaleDateString()}
                      </MarineTableCell>
                      <MarineTableCell>
                        {(trip.sensorCount || 0) > 0 ? (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm font-mono text-foreground whitespace-nowrap">
                              <Activity size={12} className="shrink-0 text-cyan-600" />
                              <span>{trip.sensorCount.toLocaleString()}</span>
                              <span className="font-sans text-xs text-muted-foreground font-medium">readings</span>
                            </div>
                            {trip.locationName && (
                              <div className="max-w-[300px] truncate text-slate-500">
                                <p className="font-sans text-xs mt-0.5" title={trip.locationName}>{trip.locationName}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </MarineTableCell>
                      <MarineTableCell align="right">
                        <div className="flex items-center justify-end gap-3">
                          <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                          {(canEdit || canDelete) && (
                            <MarineTableActionMenu>
                              {canEdit && (
                                <MarineTableActionItem onClick={() => setEditing(trip)}>
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
                          {trip.title}
                        </span>
                        <MarineTableStatus status={trip.status} label={STATUS[trip.status]?.text || 'Unknown'} />
                      </div>
                      
                      {trip.description && <p className="text-xs font-normal text-muted-foreground line-clamp-2">{trip.description}</p>}
                      
                      <div className="flex flex-col gap-1.5 mt-2">
                        {trip.project && (
                          <div onClick={e => { e.stopPropagation(); navigate(`/projects/${trip.project._id}`) }}
                            title={trip.project.name}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer w-fit">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold shrink-0">PROJECT</span>
                            <span className="text-sm font-mono text-foreground truncate block max-w-[150px] sm:max-w-[250px]">{trip.project.name}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1.5 text-sm font-mono text-foreground">
                          <Clock size={11} className="shrink-0 text-muted-foreground" />
                          <span className="text-[10px] font-sans uppercase tracking-widest text-muted-foreground font-semibold">Created</span>
                          <span>{new Date(trip.createdAt).toLocaleDateString()}</span>
                        </div>

                        {(trip.sensorCount || 0) > 0 && (
                          <div className="flex items-center gap-1.5 text-sm font-mono text-foreground">
                            <Activity size={12} className="shrink-0 text-cyan-600" />
                            <span>{trip.sensorCount.toLocaleString()}</span>
                            <span className="font-sans text-xs text-muted-foreground font-medium">readings</span>
                            {trip.locationName && <span className="font-sans text-xs text-muted-foreground truncate">· {trip.locationName}</span>}
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
                              <MarineTableActionItem onClick={() => setEditing(trip)}>
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

          <Pagination
            page={tripsData.page} totalPages={tripsData.totalPages}
            total={tripsData.total} limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      {editing && (
        <TripForm projectId={editing.project?._id} tripData={editing} onClose={() => setEditing(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Trip"
          message={`Are you sure you want to delete "${confirmDelete.title}"?`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
