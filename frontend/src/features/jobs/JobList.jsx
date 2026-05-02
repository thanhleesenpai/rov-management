import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Upload, ChevronDown, ChevronRight, File } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, useSensor, useSensors, DragOverlay,
  useDroppable, useDndContext
} from '@dnd-kit/core'
import { MouseSensor, TouchSensor } from '@/lib/dnd-sensors'
import { arrayMove } from '@dnd-kit/sortable'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import JobForm from './components/JobForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import MediaUpload from '@/features/media/MediaUpload'
import MediaGallery from '@/features/media/MediaGallery'

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-gray-100 text-gray-600',  accent: 'bg-gray-300' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700',  accent: 'bg-blue-500' },
  done:    { text: 'Done',    cls: 'bg-green-100 text-green-700', accent: 'bg-green-500' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600',   accent: 'bg-red-500' },
}


function MediaThumb({ media }) {
  const { data: url } = useQuery({
    queryKey: ['media-url', media._id],
    queryFn: () => api.get(`/media/${media._id}/url`).then(r => r.data.url),
    staleTime: 50 * 60 * 1000,
  })
  const ext = media.originalName?.split('.').pop()?.toLowerCase()
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'm4v'].includes(ext)
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)

  return (
    <div className="w-8 h-8 rounded overflow-hidden bg-gray-200 shrink-0">
      {isImage && url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : isVideo && url ? (
        <video src={url} muted className="w-full h-full object-cover"
          onLoadedMetadata={e => { e.target.currentTime = 1 }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <File size={12} className="text-gray-400" />
        </div>
      )}
    </div>
  )
}

function JobCard({ job, tripId, canEdit, canDelete, onEdit, onDelete }) {
  const { user } = useAuthStore()
  const [expanded, setExpanded] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const { text, cls, accent } = STATUS[job.status] || STATUS.pending
  const canUpload = ['admin', 'operator'].includes(user?.role)

  // Auto-expand khi kéo media từ job khác vào
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `job-card-${job._id}`,
    data: { jobId: job._id },
  })
  const { active } = useDndContext()
  const isDraggingFromOther = !!active?.data?.current?.jobId && active.data.current.jobId !== job._id
  const expandTimerRef = useRef(null)

  useEffect(() => {
    if (isDraggingFromOther && isOver && !expanded) {
      expandTimerRef.current = setTimeout(() => setExpanded(true), 400)
    } else if (!isOver || !isDraggingFromOther) {
      clearTimeout(expandTimerRef.current)
    }
    return () => clearTimeout(expandTimerRef.current)
  }, [isDraggingFromOther, isOver])

  // Media count badge
  const { data: mediaList = [] } = useQuery({
    queryKey: ['media', job._id],
    queryFn: () => api.get(`/media/job/${job._id}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const mediaCount = mediaList.length

  return (
    <div
      ref={setDropRef}
      className={`bg-white rounded-xl border overflow-hidden transition-shadow ${
        isDraggingFromOther && isOver
          ? 'border-blue-400 shadow-md shadow-blue-100'
          : 'border-gray-200 shadow-sm hover:shadow-md'
      }`}
    >
      {/* Accent bar + header */}
      <div className="flex">
        {/* Status accent bar */}
        <div className={`w-1 shrink-0 ${accent}`} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="px-3 py-3">
            <div className="flex items-start gap-2">
              {/* Expand toggle */}
              <button onClick={() => setExpanded(v => !v)} className="mt-0.5 shrink-0 text-gray-400">
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {/* Title + status */}
              <button onClick={() => setExpanded(v => !v)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-gray-800">{job.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                  {mediaCount > 0 && (
                    <span className="text-xs text-gray-400 flex items-center gap-0.5">
                      <File size={10} />{mediaCount}
                    </span>
                  )}
                </div>
                {job.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{job.description}</p>
                )}
              </button>

              {/* Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                {canUpload && (
                  <button data-no-dnd onClick={() => setShowUpload(true)} title="Upload"
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                    <Upload size={14} />
                  </button>
                )}
                {canEdit && (
                  <button data-no-dnd onClick={onEdit}
                    className="p-1.5 text-gray-400 hover:text-yellow-600 rounded-lg hover:bg-yellow-50 transition-colors">
                    <Pencil size={14} />
                  </button>
                )}
                {canDelete && (
                  <button data-no-dnd onClick={onDelete}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Thumbnail strip khi collapsed */}
          {!expanded && mediaCount > 0 && (
            <div className="px-3 pb-2.5 flex items-center gap-1 ml-5">
              {mediaList.slice(0, 5).map(m => (
                <MediaThumb key={m._id} media={m} />
              ))}
              {mediaCount > 5 && (
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-medium border border-gray-200">
                  +{mediaCount - 5}
                </div>
              )}
            </div>
          )}

          {/* Media section */}
          {expanded && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <MediaGallery jobId={job._id} />
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <MediaUpload
          jobId={job._id}
          tripId={tripId}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  )
}

export default function JobList({ tripId }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [activeMedia, setActiveMedia] = useState(null) // { media, jobId }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const handleDragStart = ({ active }) => {
    setActiveMedia(active.data.current ?? null)
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveMedia(null)
    if (!canEdit) return
    if (!over || active.id === over.id) return

    const srcJobId = active.data.current?.jobId
    const dstJobId = over.data.current?.jobId
    if (!srcJobId || !dstJobId) return
    if (srcJobId === dstJobId && String(over.id).startsWith('job-drop-')) return

    if (srcJobId === dstJobId) {
      // Reorder within same job — optimistic update
      queryClient.setQueryData(['media', srcJobId], (old = []) => {
        const oldIndex = old.findIndex(m => m._id === active.id)
        const newIndex = old.findIndex(m => m._id === over.id)
        if (oldIndex === -1 || newIndex === -1) return old
        const next = arrayMove(old, oldIndex, newIndex)
        api.patch('/media/reorder', { items: next.map((m, i) => ({ id: m._id, order: i })) })
          .catch(() => queryClient.invalidateQueries({ queryKey: ['media', srcJobId] }))
        return next
      })
    } else {
      // Move to different job
      api.patch(`/media/${active.id}/move`, { jobId: dstJobId })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['media', srcJobId] })
          queryClient.invalidateQueries({ queryKey: ['media', dstJobId] })
          toast.success('File moved to another job')
        })
        .catch(() => toast.error('Failed to move file'))
    }
  }

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', tripId],
    queryFn: () => api.get(`/trips/${tripId}/jobs`).then(r => r.data),
    refetchInterval: 30000,
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
        <div>
          <h2 className="font-semibold text-gray-700">Jobs</h2>
          {canEdit && (
            <p className="text-xs text-gray-400 mt-0.5 [@media(hover:hover)]:hidden">
              Hold file to reorder · drag to another job to move
            </p>
          )}
        </div>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-2">
            {jobs?.map(job => (
              <JobCard
                key={job._id}
                job={job}
                tripId={tripId}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={() => { setEditing(job); setShowForm(true) }}
                onDelete={() => setConfirmDelete(job)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeMedia?.media ? (
              <div className="w-24 aspect-square rounded-lg bg-gray-800 shadow-2xl opacity-90 flex flex-col items-center justify-center gap-1 border-2 border-blue-400">
                <File size={20} className="text-gray-300" />
                <p className="text-white text-xs px-2 truncate w-full text-center">
                  {activeMedia.media.originalName}
                </p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
