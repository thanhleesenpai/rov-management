import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Eye, Search, Anchor } from 'lucide-react'
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

const STATUS_LABEL = {
  active:      { text: 'Active',      cls: 'bg-green-100 text-green-700' },
  maintenance: { text: 'Maintenance', cls: 'bg-yellow-100 text-yellow-700' },
  retired:     { text: 'Retired',     cls: 'bg-gray-200 text-gray-600' },
}

const LIMIT = 10

export default function RovsPage() {
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
    queryKey: ['rovs', { page, search: debouncedSearch, status: filterStatus }],
    queryFn: () => api.get('/rovs', { params: { page, limit: LIMIT, search: debouncedSearch || undefined, status: filterStatus || undefined } }).then(r => r.data),
    keepPreviousData: true
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/rovs/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rovs'] }); toast.success('ROV deleted'); setConfirmDelete(null) },
    onError: () => toast.error('Failed to delete ROV')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const handleClose = () => { setEditing(null); setShowForm(false) }

  const rovs = data?.data || []
  const isEmpty = !isLoading && rovs.length === 0

  const fetchAllRovs = () => api.get('/rovs', { params: { limit: 1000, search: debouncedSearch || undefined, status: filterStatus || undefined } })
  const handleExportCSV = async () => { const res = await fetchAllRovs(); exportRovsCSV(res?.data?.data || []) }
  const handleExportPDF = async () => { const res = await fetchAllRovs(); exportRovsPDF(res?.data?.data || []) }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">ROV Registry</h1>
        <div className="flex items-center gap-2">
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm">
              <Plus size={15} /> <span className="hidden sm:inline">Add ROV</span><span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Search name, model, serial..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shrink-0">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </select>
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
            ? <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add ROV</button>
            : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Name</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Model</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Serial Number</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-right px-6 py-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rovs.map(rov => {
                  const { text, cls } = STATUS_LABEL[rov.status] || STATUS_LABEL.active
                  return (
                    <tr key={rov._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-800">{rov.name}</td>
                      <td className="px-6 py-4 text-gray-600">{rov.model}</td>
                      <td className="px-6 py-4 text-gray-500 font-mono text-xs">{rov.serialNumber}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/rovs/${rov._id}`} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="View">
                            <Eye size={15} />
                          </Link>
                          {canEdit && (
                            <button onClick={() => { setEditing(rov); setShowForm(true) }}
                              className="p-1.5 text-gray-400 hover:text-yellow-600 rounded" title="Edit">
                              <Pencil size={15} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setConfirmDelete(rov)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Delete">
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
            {rovs.map(rov => {
              const { text, cls } = STATUS_LABEL[rov.status] || STATUS_LABEL.active
              return (
                <div key={rov._id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{rov.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="text-gray-400">Model:</span> {rov.model}
                      </p>
                      {rov.serialNumber && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          <span className="not-italic font-sans">S/N:</span> {rov.serialNumber}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      <Link to={`/rovs/${rov._id}`} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                        <Eye size={14} />
                      </Link>
                      {canEdit && (
                        <button onClick={() => { setEditing(rov); setShowForm(true) }}
                          className="p-1.5 text-gray-400 hover:text-yellow-600 rounded">
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setConfirmDelete(rov)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded">
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
          message={`Are you sure you want to delete "${confirmDelete.name}"? This action cannot be undone.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
