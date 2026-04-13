import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import JobForm from './components/JobForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-gray-100 text-gray-600' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700' },
  done:    { text: 'Done',    cls: 'bg-green-100 text-green-700' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600' }
}

export default function JobList({ tripId }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', tripId],
    queryFn: () => api.get(`/trips/${tripId}/jobs`).then(r => r.data)
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
  const handleClose = () => { setEditing(null); setShowForm(false) }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-700">Jobs</h2>
        {canEdit && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus size={14} /> Add Job
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : jobs?.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No jobs yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs?.map(job => {
            const { text, cls } = STATUS[job.status] || STATUS.pending
            return (
              <div key={job._id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                  </div>
                  <p className="font-medium text-sm text-gray-800">{job.title}</p>
                  {job.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{job.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canEdit && (
                    <button onClick={() => { setEditing(job); setShowForm(true) }}
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
            )
          })}
        </div>
      )}

      {showForm && <JobForm tripId={tripId} jobData={editing} onClose={handleClose} />}

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
