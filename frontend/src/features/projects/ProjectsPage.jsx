import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Eye, PenLine, Trash, MapPin, Clock, Search, X, Map, ChevronRight, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import ProjectForm from './components/ProjectForm'
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
import { exportProjectsCSV, exportProjectsPDF } from '@/lib/export'
import { useDebounce } from '@/hooks/useDebounce'

const STATUS = {
  planned: { text: 'Planned', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ongoing: { text: 'Ongoing', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  completed: { text: 'Completed', cls: 'bg-muted text-muted-foreground' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' }
}

const LIMIT = 10

export default function ProjectsPage() {
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
    queryKey: ['projects', { page, search: debouncedSearch, status: filterStatus, rovId: filterRov, fromDate, toDate }],
    queryFn: () => api.get('/projects', {
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
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project deleted')
      setConfirmDelete(null)
    },
    onError: () => toast.error('Failed to delete project')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const handleClose = () => { setEditing(null); setShowForm(false) }

  const hasActiveFilter = filterStatus || filterRov || fromDate || toDate
  const resetFilters = () => { setFilterStatus(''); setFilterRov(''); setFromDate(''); setToDate(''); setPage(1) }
  const resetPage = () => setPage(1)

  const fetchAllProjects = () => api.get('/projects', {
    params: {
      limit: 1000,
      search: debouncedSearch || undefined,
      status: filterStatus || undefined,
      rovId: filterRov || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }
  })
  const handleExportCSV = async () => { const res = await fetchAllProjects(); exportProjectsCSV(res?.data?.data || []) }
  const handleExportPDF = async () => { const res = await fetchAllProjects(); exportProjectsPDF(res?.data?.data || []) }

  const projects = data?.data || []
  const isEmpty = !isLoading && projects.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        <div className="flex items-center gap-2">
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
          {canEdit && (
            <MarineButton variant="solid" icon={Plus} onClick={() => setShowForm(true)} className="max-sm:w-9 max-sm:px-0">
              <span className="hidden sm:inline">New Project</span>
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
            <MarineDatePicker aria-label="Start date filter" value={fromDate} onChange={e => { setFromDate(e.target.value); resetPage() }} className="w-full sm:w-[120px]" />
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0 hidden sm:block" />
            <MarineDatePicker aria-label="End date filter" value={toDate} min={fromDate} onChange={e => { setToDate(e.target.value); resetPage() }} className="w-full sm:w-[120px]" />
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
          title={search || hasActiveFilter ? 'No projects match your filters' : 'No projects yet'}
          description={!search && !hasActiveFilter && canEdit ? 'Create a project to start tracking ROV trips.' : undefined}
          action={!search && !hasActiveFilter && canEdit
            ? <MarineButton variant="solid" onClick={() => setShowForm(true)}>Create Project</MarineButton>
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
                {projects.map(project => {
                  return (
                    <MarineTableRow key={project._id} onClick={() => navigate(`/projects/${project._id}`)}>
                      <MarineTableCell>
                        <Link to={`/projects/${project._id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-foreground hover:text-cyan-600 transition-colors truncate block max-w-[120px] lg:max-w-[200px]" title={project.name}>
                          {project.name}
                        </Link>
                        {project.description && <p className="text-xs text-muted-foreground font-normal mt-0.5 truncate max-w-[120px] lg:max-w-[200px]" title={project.description}>{project.description}</p>}
                      </MarineTableCell>
                      <MarineTableCell>
                        {project.rov ? (
                          <Link to={`/rovs/${project.rov._id}`} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer w-fit"
                            title={project.rov.name}>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold shrink-0">ROV</span>
                            <span className="text-sm font-mono text-foreground truncate block max-w-[120px]">{project.rov.name.replace(/^ROV\s+/i, '')}</span>
                          </Link>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        {(project.locationName || project.location) ? (
                          <span className="truncate max-w-[120px] lg:max-w-[200px] block" title={project.locationName || project.location}>
                            {project.locationName || project.location}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell isMono>
                        {project.startTime ? (
                          <span title={project.endTime ? `${new Date(project.startTime).toLocaleDateString()} → ${new Date(project.endTime).toLocaleDateString()}` : new Date(project.startTime).toLocaleDateString()}>
                            {new Date(project.startTime).toLocaleDateString()}
                            {project.endTime && ` → ${new Date(project.endTime).toLocaleDateString()}`}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </MarineTableCell>
                      <MarineTableCell>
                        <MarineTableStatus status={project.status} label={STATUS[project.status]?.text || 'Unknown'} />
                      </MarineTableCell>
                      <MarineTableCell align="right">
                        <div className="flex items-center justify-end gap-3">
                          <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                          {(canEdit || canDelete) && (
                            <MarineTableActionMenu>
                              {canEdit && (
                                <MarineTableActionItem onClick={() => { setEditing(project); setShowForm(true) }}>
                                  <PenLine size={14} /> Edit
                                </MarineTableActionItem>
                              )}
                              {canDelete && (
                                <MarineTableActionItem onClick={() => setConfirmDelete(project)} isDanger>
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
            {projects.map(project => {
              return (
                <div key={project._id} onClick={() => navigate(`/projects/${project._id}`)}
                  className="bg-card rounded-lg border border-border shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[200px] sm:max-w-xs">
                          {project.name}
                        </span>
                        <MarineTableStatus status={project.status} label={STATUS[project.status]?.text || 'Unknown'} />
                      </div>

                      {project.description && <p className="text-xs text-muted-foreground font-normal line-clamp-2">{project.description}</p>}

                      <div className="flex flex-col gap-1.5 mt-2">
                        {project.rov && (
                          <div onClick={e => { e.stopPropagation(); navigate(`/rovs/${project.rov._id}`) }}
                            title={project.rov.name}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer w-fit">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold shrink-0">ROV</span>
                            <span className="text-sm font-mono text-foreground truncate block max-w-[120px] sm:max-w-[180px]">{project.rov.name.replace(/^ROV\s+/i, '')}</span>
                          </div>
                        )}

                        {((project.locationName || project.location) || project.startTime) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {(project.locationName || project.location) && (
                              <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                                <MapPin size={11} className="shrink-0 text-muted-foreground" />
                                <span className="truncate max-w-[120px]">{project.locationName || project.location}</span>
                              </div>
                            )}
                            {project.startTime && (
                              <div className="flex items-center gap-1 text-sm font-mono text-foreground">
                                <Clock size={11} className="shrink-0 text-muted-foreground" />
                                <span>
                                  {new Date(project.startTime).toLocaleDateString()}
                                  {project.endTime && ` → ${new Date(project.endTime).toLocaleDateString()}`}
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
                              <MarineTableActionItem onClick={() => { setEditing(project); setShowForm(true) }}>
                                <PenLine size={14} /> Edit
                              </MarineTableActionItem>
                            )}
                            {canDelete && (
                              <MarineTableActionItem onClick={() => setConfirmDelete(project)} isDanger>
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

      {showForm && <ProjectForm projectData={editing} onClose={handleClose} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Project"
          message={`Are you sure you want to delete "${confirmDelete.name}"?\n\n⚠️ WARNING: All associated trips in this project will also be deleted. This action cannot be undone.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
