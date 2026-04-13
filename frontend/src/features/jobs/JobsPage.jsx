import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, ExternalLink, Search } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import JobForm from './components/JobForm'
import { TableSkeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Pagination from '@/components/shared/Pagination'
import { useDebounce } from '@/hooks/useDebounce'

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-gray-100 text-gray-600' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700' },
  done:    { text: 'Done',    cls: 'bg-green-100 text-green-700' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600' }
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
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search)

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', { page, search: debouncedSearch, tripId: filterTrip, status: filterStatus }],
    queryFn: () => api.get('/jobs', {
      params: {
        page, limit: LIMIT,
        search: debouncedSearch || undefined,
        tripId: filterTrip || undefined,
        status: filterStatus || undefined
      }
    }).then(r => r.data),
    keepPreviousData: true
  })

  const { data: trips } = useQuery({
    queryKey: ['trips', 'all'],
    queryFn: () => api.get('/trips', { params: { limit: 100 } }).then(r => r.data?.data || [])
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Job deleted')
      setConfirmDelete(null)
    },
    onError: () => toast.error('Failed to delete job')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'

  const jobs = jobsData?.data || []
  const isEmpty = !isLoading && jobs.length === 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Jobs</h1>
      </div>

      {/* Search & filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Search job title..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={filterTrip} onChange={e => { setFilterTrip(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Trips</option>
          {trips?.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={LIMIT} cols={4} />
      ) : isEmpty ? (
        <div className="text-center py-16 text-gray-400">No jobs found.</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Title</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium hidden md:table-cell">Trip</th>
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
                      <td className="px-6 py-4 hidden md:table-cell">
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
          <Pagination
            page={jobsData.page} totalPages={jobsData.totalPages}
            total={jobsData.total} limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      {editing && (
        <JobForm tripId={editing.trip?._id} jobData={editing}
          onClose={() => setEditing(null)} />
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
