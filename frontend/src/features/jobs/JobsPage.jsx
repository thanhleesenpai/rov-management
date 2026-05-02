import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, ExternalLink, Search, X, Briefcase } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import JobForm from './components/JobForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import { exportJobsCSV, exportJobsPDF } from '@/lib/export'
import { useDebounce } from '@/hooks/useDebounce'
import EmptyState from '@/components/shared/EmptyState'

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-gray-100 text-gray-600' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700' },
  done:    { text: 'Done',    cls: 'bg-green-100 text-green-700' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600' },
}

const LIMIT = 10

export default function JobsPage() {
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

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', { page, search: debouncedSearch, tripId: filterTrip, status: filterStatus, fromDate, toDate }],
    queryFn: () => api.get('/jobs', {
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
    mutationFn: (id) => api.delete(`/jobs/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['jobs'] }); toast.success('Job deleted'); setConfirmDelete(null) },
    onError: () => toast.error('Failed to delete job')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const jobs = jobsData?.data || []
  const isEmpty = !isLoading && jobs.length === 0

  const hasActiveFilter = filterTrip || filterStatus || fromDate || toDate
  const resetFilters = () => { setFilterTrip(''); setFilterStatus(''); setFromDate(''); setToDate(''); setPage(1) }

  const fetchAllJobs = () => api.get('/jobs', { params: { limit: 1000, search: debouncedSearch || undefined, tripId: filterTrip || undefined, status: filterStatus || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined } })
  const handleExportCSV = async () => { const res = await fetchAllJobs(); exportJobsCSV(res?.data?.data || []) }
  const handleExportPDF = async () => { const res = await fetchAllJobs(); exportJobsPDF(res?.data?.data || []) }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Jobs</h1>
        <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
      </div>

      {/* Search & filter */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search job title..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <select value={filterTrip} onChange={e => { setFilterTrip(e.target.value); setPage(1) }}
              className="flex-1 sm:flex-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">All Trips</option>
              {trips?.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
              className="flex-1 sm:flex-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 shrink-0">Created:</span>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" value={toDate} min={fromDate} onChange={e => { setToDate(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          {hasActiveFilter && (
            <button onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors">
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
        <EmptyState icon={Briefcase} title="No jobs found" description="Jobs are created inside each trip." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Title</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Trip</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-right px-6 py-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map(job => {
                  const { text, cls } = STATUS[job.status] || STATUS.pending
                  return (
                    <tr key={job._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-800">{job.title}</p>
                        {job.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{job.description}</p>}
                      </td>
                      <td className="px-6 py-4">
                        {job.trip ? (
                          <Link to={`/trips/${job.trip._id}`}
                            className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
                            {job.trip.name} <ExternalLink size={11} />
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {job.trip && (
                            <Link to={`/trips/${job.trip._id}`} title="View trip"
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                              <ExternalLink size={15} />
                            </Link>
                          )}
                          {canEdit && (
                            <button onClick={() => setEditing(job)}
                              className="p-1.5 text-gray-400 hover:text-yellow-600 rounded">
                              <Pencil size={15} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setConfirmDelete(job)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded">
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
            {jobs.map(job => {
              const { text, cls } = STATUS[job.status] || STATUS.pending
              return (
                <div key={job._id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{job.title}</p>
                      {job.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{job.description}</p>}
                      {job.trip && (
                        <Link to={`/trips/${job.trip._id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 mt-1 hover:underline">
                          {job.trip.name} <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      {canEdit && (
                        <button onClick={() => setEditing(job)}
                          className="p-1.5 text-gray-400 hover:text-yellow-600 rounded">
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setConfirmDelete(job)}
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
            page={jobsData.page} totalPages={jobsData.totalPages}
            total={jobsData.total} limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      {editing && (
        <JobForm tripId={editing.trip?._id} jobData={editing} onClose={() => setEditing(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Job"
          message={`Are you sure you want to delete "${confirmDelete.title}"?`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
