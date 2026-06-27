import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Map, Clock, CheckCircle2, Anchor, MapPin, Eye, ChevronRight } from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import RovForm from './components/RovForm'
import { Skeleton } from '@/components/shared/Skeleton'
import { 
  MarineTable, MarineTableHeader, MarineTableBody, 
  MarineTableRow, MarineTableHead, MarineTableCell, MarineTableStatus 
} from '@/components/bespoke/MarineTable'

const STATUS_LABEL = {
  active:      { text: 'Active',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  maintenance: { text: 'Maintenance', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  retired:     { text: 'Retired',     cls: 'bg-muted text-muted-foreground' }
}

const PROJECT_STATUS = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  completed: { text: 'Completed', cls: 'bg-muted text-muted-foreground' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' }
}

function calcTotalHours(projects) {
  let ms = 0
  projects.forEach(t => {
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

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', { rovId: id }],
    queryFn: () => api.get('/projects', { params: { rovId: id, limit: 100 } }).then(r => r.data),
    enabled: !!id
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const projects = projectsData?.data || []
  const completedProjects = projects.filter(t => t.status === 'completed').length
  const ongoingProjects   = projects.filter(t => t.status === 'ongoing').length

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
      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <button onClick={() => navigate('/rovs')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft size={16} /> Back to ROVs
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{rov.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
            </div>
            {canEdit && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-card shadow-sm rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors">
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* ── Stats (KPI Metrics) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Map,          label: 'Total Projects',  value: projectsLoading ? '…' : projects.length,          color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { icon: CheckCircle2, label: 'Completed',    value: projectsLoading ? '…' : completedProjects,        color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20' },
            { icon: Anchor,       label: 'Active Now',   value: projectsLoading ? '…' : ongoingProjects,          color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
            { icon: Clock,        label: 'Total Hours',  value: projectsLoading ? '…' : calcTotalHours(projects), color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-md p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <Icon size={16} className={color} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-0.5">{label}</span>
                  <span className="font-mono text-lg font-medium text-foreground leading-tight">{value}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Info grid (Unified Card) ── */}
        <div className="bg-card border border-border rounded-lg shadow-sm p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Model</span>
              <span className="text-sm font-mono text-foreground">{rov.model || '—'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Serial Number</span>
              <span className="text-sm font-mono text-foreground">{rov.serialNumber}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Registered</span>
              <span className="text-sm font-mono text-foreground">{new Date(rov.createdAt).toLocaleDateString()}</span>
            </div>
            {rov.specs && Object.entries(rov.specs).map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">{k}</span>
                <span className="text-sm font-mono text-foreground">{String(v)}</span>
              </div>
            ))}
          </div>
          {rov.notes && (
            <div className="mt-6 pt-6 border-t border-border">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 block">Notes</span>
              <span className="text-sm font-normal text-foreground whitespace-pre-wrap">{rov.notes}</span>
            </div>
          )}
        </div>

        {/* ── Project history ── */}
        <div>
          <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Project History</h2>

          {projectsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No projects recorded for this ROV.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden xl:block">
                <MarineTable>
                  <MarineTableHeader>
                    <MarineTableRow>
                      <MarineTableHead>Project Name</MarineTableHead>
                      <MarineTableHead>Location</MarineTableHead>
                      <MarineTableHead>Dates</MarineTableHead>
                      <MarineTableHead>Status</MarineTableHead>
                      <MarineTableHead align="right"></MarineTableHead>
                    </MarineTableRow>
                  </MarineTableHeader>
                  <MarineTableBody>
                    {projects.map(project => {
                      const ts = PROJECT_STATUS[project.status] || PROJECT_STATUS.planned
                      return (
                        <MarineTableRow key={project._id} onClick={() => navigate(`/projects/${project._id}`)}>
                          <MarineTableCell>
                            <Link to={`/projects/${project._id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-foreground hover:text-cyan-600 transition-colors truncate block w-fit">
                              {project.name}
                            </Link>
                          </MarineTableCell>
                          <MarineTableCell>
                            {project.location ? (
                              <span className="truncate max-w-xs block" title={project.location}>{project.location}</span>
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
                            <MarineTableStatus status={project.status} label={ts.text} />
                          </MarineTableCell>
                          <MarineTableCell align="right">
                            <ChevronRight size={18} className="text-slate-300 dark:text-slate-500 group-hover:text-cyan-600 group-hover:translate-x-1 transition-all duration-200 ml-auto" />
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
                  const ts = PROJECT_STATUS[project.status] || PROJECT_STATUS.planned
                  return (
                    <div key={project._id} onClick={() => navigate(`/projects/${project._id}`)}
                      className="bg-card rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[160px] sm:max-w-xs">
                              {project.name}
                            </span>
                            <MarineTableStatus status={project.status} label={ts.text} />
                          </div>
                          
                          {(project.location || project.startTime) && (
                            <div className="flex flex-col gap-1.5 mt-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {project.location && (
                                  <div className="flex items-center gap-1 font-sans text-xs text-slate-500 dark:text-slate-400">
                                    <MapPin size={11} className="shrink-0" />
                                    <span className="truncate max-w-[120px]">{project.location}</span>
                                  </div>
                                )}
                                {project.startTime && (
                                  <div className="flex items-center gap-1 font-mono text-xs tracking-tight text-slate-500 dark:text-slate-400">
                                    <Clock size={11} className="shrink-0" />
                                    <span>
                                      {new Date(project.startTime).toLocaleDateString()}
                                      {project.endTime && ` → ${new Date(project.endTime).toLocaleDateString()}`}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0 pl-2 self-center">
                          <ChevronRight size={18} className="text-slate-300 dark:text-slate-500 group-hover:text-cyan-600 group-hover:translate-x-1 transition-all duration-200" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Created</span>
          <span className="text-sm font-mono text-foreground">{new Date(rov.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {showForm && <RovForm rovData={rov} onClose={() => setShowForm(false)} />}
    </div>
  )
}
