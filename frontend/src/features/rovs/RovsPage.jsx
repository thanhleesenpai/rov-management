import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, PenLine, Trash, Eye, Search, Anchor, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import RovForm from './components/RovForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import EmptyState from '@/components/shared/EmptyState'
import { exportRovsCSV, exportRovsPDF } from '@/lib/export'
import { useDebounce } from '@/hooks/useDebounce'
import { MarineInput } from '@/components/bespoke/MarineInput'
import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineButton } from '@/components/bespoke/MarineButton'
import { 
  MarineTable, MarineTableHeader, MarineTableBody, 
  MarineTableRow, MarineTableHead, MarineTableCell, MarineTableStatus,
  MarineTableActionMenu, MarineTableActionItem
} from '@/components/bespoke/MarineTable'

const STATUS_LABEL = {
  active:      { text: 'Active',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  maintenance: { text: 'Maintenance', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  retired:     { text: 'Retired',     cls: 'bg-muted text-muted-foreground' },
}

const LIMIT = 10

export default function RovsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [rovProjectCount, setRovProjectCount] = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search)

  const { data, isLoading } = useQuery({
    queryKey: ['rovs', { page, search: debouncedSearch, status: filterStatus }],
    queryFn: () => api.get('/rovs', { params: { page, limit: LIMIT, search: debouncedSearch || undefined, status: filterStatus || undefined } }).then(r => r.data),
    keepPreviousData: true
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/rovs/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rovs'] }); toast.success('ROV deleted'); setConfirmDelete(null); setRovProjectCount(0) },
    onError: (err) => {
      const message = err?.response?.data?.message || err?.message || 'Failed to delete ROV';
      if (message.includes('being used') || message.includes('project')) {
        toast.error(message, { duration: 5000 });
      } else {
        toast.error(message);
      }
      setConfirmDelete(null);
      setRovProjectCount(0);
    }
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const handleClose = () => { setEditing(null); setShowForm(false) }

  const rovs = data?.data || []
  const isEmpty = !isLoading && rovs.length === 0

  const handleDeleteClick = async (rov) => {
    try {
      const res = await api.get(`/projects?rovId=${rov._id}&limit=1`);
      const projectCount = res?.data?.total || 0;
      setRovProjectCount(projectCount);
      setConfirmDelete(rov);
    } catch {
      setRovProjectCount(0);
      setConfirmDelete(rov);
    }
  }

  const fetchAllRovs = () => api.get('/rovs', { params: { limit: 1000, search: debouncedSearch || undefined, status: filterStatus || undefined } })
  const handleExportCSV = async () => { const res = await fetchAllRovs(); exportRovsCSV(res?.data?.data || []) }
  const handleExportPDF = async () => { const res = await fetchAllRovs(); exportRovsPDF(res?.data?.data || []) }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">ROV Registry</h1>
        <div className="flex items-center gap-2">
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
          {canEdit && (
            <MarineButton variant="solid" icon={Plus} onClick={() => setShowForm(true)} className="max-sm:w-9 max-sm:px-0">
              <span className="hidden sm:inline">Add ROV</span>
            </MarineButton>
          )}
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 mx-0 md:mx-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <MarineInput
            placeholder="Search name, model, serial..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3"
          />
        </div>
        <div className="flex gap-2">
          <div className="w-32 shrink-0">
            <MarineSelect value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </MarineSelect>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={Anchor}
          title={search || filterStatus ? 'No ROVs match your filters' : 'No ROVs yet'}
          description={!search && !filterStatus && canEdit ? 'Get started by adding your first ROV.' : undefined}
          action={!search && !filterStatus && canEdit
            ? <MarineButton variant="solid" onClick={() => setShowForm(true)}>Add ROV</MarineButton>
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
                  <MarineTableHead>Model</MarineTableHead>
                  <MarineTableHead>Serial Number</MarineTableHead>
                  <MarineTableHead>Status</MarineTableHead>
                  <MarineTableHead align="right">Actions</MarineTableHead>
                </MarineTableRow>
              </MarineTableHeader>
              <MarineTableBody>
                {rovs.map(rov => (
                  <MarineTableRow key={rov._id} onClick={() => navigate(`/rovs/${rov._id}`)}>
                    <MarineTableCell>
                      <span className="text-sm font-medium text-foreground">{rov.name}</span>
                    </MarineTableCell>
                    <MarineTableCell isMono>
                      <span title={rov.model}>{rov.model || '—'}</span>
                    </MarineTableCell>
                    <MarineTableCell isMono>
                      <span title={rov.serialNumber}>{rov.serialNumber || '—'}</span>
                    </MarineTableCell>
                    <MarineTableCell>
                      <MarineTableStatus status={rov.status} label={STATUS_LABEL[rov.status]?.text || 'Unknown'} />
                    </MarineTableCell>
                    <MarineTableCell align="right">
                      <div className="flex items-center justify-end gap-3">
                        <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                        {(canEdit || canDelete) && (
                          <MarineTableActionMenu>
                            {canEdit && (
                              <MarineTableActionItem onClick={() => { setEditing(rov); setShowForm(true) }}>
                                <PenLine size={14} /> Edit
                              </MarineTableActionItem>
                            )}
                            {canDelete && (
                              <MarineTableActionItem onClick={() => handleDeleteClick(rov)} isDanger>
                                <Trash size={14} /> Delete
                              </MarineTableActionItem>
                            )}
                          </MarineTableActionMenu>
                        )}
                      </div>
                    </MarineTableCell>
                  </MarineTableRow>
                ))}
              </MarineTableBody>
            </MarineTable>
          </div>

          {/* Mobile card list */}
          <div className="xl:hidden space-y-2">
            {rovs.map(rov => {
              return (
                <div key={rov._id} onClick={() => navigate(`/rovs/${rov._id}`)}
                  className="bg-card rounded-lg border border-border shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[200px] sm:max-w-xs">
                          {rov.name}
                        </span>
                        <MarineTableStatus status={rov.status} label={STATUS_LABEL[rov.status]?.text || 'Unknown'} />
                      </div>
                      
                      <div className="flex flex-col gap-1.5 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold shrink-0">MODEL</span>
                          <span className="text-sm font-mono text-foreground truncate">{rov.model || '—'}</span>
                        </div>
                        {rov.serialNumber && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold shrink-0">S/N</span>
                            <span className="text-sm font-mono text-foreground truncate">{rov.serialNumber}</span>
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
                              <MarineTableActionItem onClick={() => { setEditing(rov); setShowForm(true) }}>
                                <PenLine size={14} /> Edit
                              </MarineTableActionItem>
                            )}
                            {canDelete && (
                              <MarineTableActionItem onClick={() => handleDeleteClick(rov)} isDanger>
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
            page={data.page} totalPages={data.totalPages}
            total={data.total} limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      {showForm && <RovForm rovData={editing} onClose={handleClose} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete ROV"
          message={rovProjectCount > 0
            ? `⚠️ Cannot delete "${confirmDelete.name}" — it is being used in ${rovProjectCount} project(s).\n\nSet its status to "Maintenance" or "Retired" instead.`
            : `Delete "${confirmDelete.name}"? This action cannot be undone.`
          }
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => { setConfirmDelete(null); setRovProjectCount(0) }}
          confirmDisabled={rovProjectCount > 0}
        />
      )}
    </div>
  )
}
