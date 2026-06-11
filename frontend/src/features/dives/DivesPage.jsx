import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { PenLine, Trash, Eye, ExternalLink, Search, X, Anchor, Activity, ArrowRight, MoreVertical, ChevronRight, Clock } from 'lucide-react'
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

export default function DivesPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
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
          <div className="relative flex-1 mx-0 md:mx-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <MarineInput placeholder="Search dive title..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 pr-3 text-sm" />
          </div>
          <div className="flex gap-2">
            <div className="w-32">
              <MarineSelect value={filterTrip} onChange={e => { setFilterTrip(e.target.value); setPage(1) }} className="text-sm">
                <option value="">All Trips</option>
                {trips?.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
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
        <EmptyState icon={Anchor} title="No dives found" description="Dives are created inside each trip." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden xl:block">
            <MarineTable>
              <MarineTableHeader>
                <MarineTableRow>
                  <MarineTableHead>Title</MarineTableHead>
                  <MarineTableHead>Trip</MarineTableHead>
                  <MarineTableHead>Status</MarineTableHead>
                  <MarineTableHead>Created</MarineTableHead>
                  <MarineTableHead>Sensor Data</MarineTableHead>
                  <MarineTableHead align="right">Actions</MarineTableHead>
                </MarineTableRow>
              </MarineTableHeader>
              <MarineTableBody>
                {dives.map(dive => {
                  return (
                    <MarineTableRow key={dive._id} onClick={() => navigate(`/dives/${dive._id}`)}>
                      <MarineTableCell>
                        <Link to={`/dives/${dive._id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-foreground hover:text-cyan-600 transition-colors truncate block w-fit">
                          {dive.title}
                        </Link>
                        {dive.description && <p className="text-xs font-normal text-muted-foreground mt-0.5 truncate max-w-xs" title={dive.description}>{dive.description}</p>}
                      </MarineTableCell>
                      <MarineTableCell>
                        {dive.trip ? (
                          <Link to={`/trips/${dive.trip._id}`} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer truncate"
                            title={dive.trip.name}>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">TRIP</span>
                            <span className="text-sm font-mono text-foreground">{dive.trip.name}</span>
                          </Link>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        <MarineTableStatus status={dive.status} label={STATUS[dive.status]?.text || 'Unknown'} />
                      </MarineTableCell>
                      <MarineTableCell isMono>
                        {new Date(dive.createdAt).toLocaleDateString()}
                      </MarineTableCell>
                      <MarineTableCell>
                        {(dive.sensorCount || 0) > 0 ? (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm font-mono text-foreground whitespace-nowrap">
                              <Activity size={12} className="shrink-0 text-cyan-600" />
                              <span>{dive.sensorCount.toLocaleString()}</span>
                              <span className="font-sans text-xs text-muted-foreground font-medium">readings</span>
                            </div>
                            {dive.locationName && (
                              <div className="max-w-[300px] truncate text-slate-500">
                                <p className="font-sans text-xs mt-0.5" title={dive.locationName}>{dive.locationName}</p>
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
                                <MarineTableActionItem onClick={() => setEditing(dive)}>
                                  <PenLine size={14} /> Edit
                                </MarineTableActionItem>
                              )}
                              {canDelete && (
                                <MarineTableActionItem onClick={() => setConfirmDelete(dive)} isDanger>
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
            {dives.map(dive => {
              return (
                <div key={dive._id} onClick={() => navigate(`/dives/${dive._id}`)}
                  className="bg-card rounded-lg border border-border shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[200px] sm:max-w-xs">
                          {dive.title}
                        </span>
                        <MarineTableStatus status={dive.status} label={STATUS[dive.status]?.text || 'Unknown'} />
                      </div>
                      
                      {dive.description && <p className="text-xs font-normal text-muted-foreground line-clamp-2">{dive.description}</p>}
                      
                      <div className="flex flex-col gap-1.5 mt-2">
                        {dive.trip && (
                          <div onClick={e => { e.stopPropagation(); navigate(`/trips/${dive.trip._id}`) }}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer w-fit">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">TRIP</span>
                            <span className="text-sm font-mono text-foreground">{dive.trip.name}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1.5 text-sm font-mono text-foreground">
                          <Clock size={11} className="shrink-0 text-muted-foreground" />
                          <span className="text-[10px] font-sans uppercase tracking-widest text-muted-foreground font-semibold">Created</span>
                          <span>{new Date(dive.createdAt).toLocaleDateString()}</span>
                        </div>

                        {(dive.sensorCount || 0) > 0 && (
                          <div className="flex items-center gap-1.5 text-sm font-mono text-foreground">
                            <Activity size={12} className="shrink-0 text-cyan-600" />
                            <span>{dive.sensorCount.toLocaleString()}</span>
                            <span className="font-sans text-xs text-muted-foreground font-medium">readings</span>
                            {dive.locationName && <span className="font-sans text-xs text-muted-foreground truncate">· {dive.locationName}</span>}
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
                              <MarineTableActionItem onClick={() => setEditing(dive)}>
                                <PenLine size={14} /> Edit
                              </MarineTableActionItem>
                            )}
                            {canDelete && (
                              <MarineTableActionItem onClick={() => setConfirmDelete(dive)} isDanger>
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
