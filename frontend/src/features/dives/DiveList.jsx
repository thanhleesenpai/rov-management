import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Upload, ChevronDown, ChevronRight, File, Activity, Eye } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, useSensor, useSensors, DragOverlay,
  useDroppable, useDndContext
} from '@dnd-kit/core'
import { MouseSensor, TouchSensor } from '@/lib/dnd-sensors'
import { arrayMove } from '@dnd-kit/sortable'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import DiveForm from './components/DiveForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import MediaUpload from '@/features/media/MediaUpload'
import MediaGallery from '@/features/media/MediaGallery'
import SensorUpload from '@/features/trips/components/SensorUpload'

const STATUS = {
  pending: { text: 'Pending', cls: 'bg-muted text-muted-foreground',                                     accent: 'bg-gray-400' },
  running: { text: 'Running', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',   accent: 'bg-blue-500' },
  done:    { text: 'Done',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', accent: 'bg-green-500' },
  failed:  { text: 'Failed',  cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',       accent: 'bg-red-500' },
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
    <div className="w-8 h-8 rounded overflow-hidden bg-muted shrink-0">
      {isImage && url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : isVideo && url ? (
        <video src={url} muted className="w-full h-full object-cover"
          onLoadedMetadata={e => { e.target.currentTime = 1 }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <File size={12} className="text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

function DiveCard({ dive, tripId, tripGpsLocation, canEdit, canDelete, onEdit, onDelete }) {
  const { user } = useAuthStore()
  const [expanded, setExpanded] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showSensorUpload, setShowSensorUpload] = useState(false)
  const { text, cls, accent } = STATUS[dive.status] || STATUS.pending
  const canUpload = ['admin', 'operator'].includes(user?.role)

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `dive-card-${dive._id}`,
    data: { diveId: dive._id },
  })
  const { active } = useDndContext()
  const isDraggingFromOther = !!active?.data?.current?.diveId && active.data.current.diveId !== dive._id
  const expandTimerRef = useRef(null)

  useEffect(() => {
    if (isDraggingFromOther && isOver && !expanded) {
      expandTimerRef.current = setTimeout(() => setExpanded(true), 400)
    } else if (!isOver || !isDraggingFromOther) {
      clearTimeout(expandTimerRef.current)
    }
    return () => clearTimeout(expandTimerRef.current)
  }, [isDraggingFromOther, isOver, expanded])

  const { data: mediaList = [] } = useQuery({
    queryKey: ['media', dive._id],
    queryFn: () => api.get(`/media/dive/${dive._id}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const mediaCount = mediaList.length

  return (
    <div
      ref={setDropRef}
      className={`bg-card rounded-xl border overflow-hidden transition-shadow ${
        isDraggingFromOther && isOver
          ? 'border-primary shadow-md'
          : 'border-border shadow-sm hover:shadow-md'
      }`}
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${accent}`} />

        <div className="flex-1 min-w-0">
          <div className="px-3 py-3">
            <div className="flex items-start gap-2">
              <button onClick={() => setExpanded(v => !v)} className="mt-0.5 shrink-0 text-muted-foreground">
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              <button onClick={() => setExpanded(v => !v)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground">{dive.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                  {mediaCount > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <File size={10} />{mediaCount}
                    </span>
                  )}
                  {(dive.sensorCount || 0) > 0 && (
                    <span className="text-xs text-primary flex items-center gap-0.5">
                      <Activity size={10} />{dive.sensorCount.toLocaleString()}
                    </span>
                  )}
                </div>
                {dive.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{dive.description}</p>
                )}
              </button>

              <div className="flex items-center gap-0.5 shrink-0">
                <Link
                  to={`/dives/${dive._id}`}
                  state={{ from: `/trips/${tripId}` }}
                  data-no-dnd
                  onClick={e => e.stopPropagation()}
                  title="View dive details"
                  className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted transition-colors"
                >
                  <Eye size={14} />
                </Link>
                {canUpload && (
                  <button data-no-dnd onClick={() => setShowSensorUpload(true)} title="Sensor data"
                    className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted transition-colors">
                    <Activity size={14} />
                  </button>
                )}
                {canUpload && (
                  <button data-no-dnd onClick={() => setShowUpload(true)} title="Upload media"
                    className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted transition-colors">
                    <Upload size={14} />
                  </button>
                )}
                {canEdit && (
                  <button data-no-dnd onClick={onEdit}
                    className="p-1.5 text-muted-foreground hover:text-yellow-500 rounded-lg hover:bg-muted transition-colors">
                    <Pencil size={14} />
                  </button>
                )}
                {canDelete && (
                  <button data-no-dnd onClick={onDelete}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {!expanded && mediaCount > 0 && (
            <div className="px-3 pb-2.5 flex items-center gap-1 ml-5">
              {mediaList.slice(0, 5).map(m => (
                <MediaThumb key={m._id} media={m} />
              ))}
              {mediaCount > 5 && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium border border-border">
                  +{mediaCount - 5}
                </div>
              )}
            </div>
          )}

          {expanded && (
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
              {/* Media section */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Media</p>
                <MediaGallery diveId={dive._id} />
              </div>

              {/* Sensor Data — compact summary, full detail in DiveDetailPage */}
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">Sensor Data</p>
                {(dive.sensorCount || 0) > 0 ? (
                  <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate" title={dive.locationName}>
                    {dive.sensorCount.toLocaleString()} readings
                    {dive.locationName ? ` · ${dive.locationName}` : ''}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground flex-1">No data</span>
                )}
                {canUpload && (
                  <button
                    data-no-dnd
                    onClick={() => setShowSensorUpload(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors shrink-0"
                  >
                    <Upload size={11} /> Upload
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <MediaUpload
          diveId={dive._id}
          tripId={tripId}
          onClose={() => setShowUpload(false)}
        />
      )}

      {showSensorUpload && (
        <SensorUpload
          dive={dive}
          tripId={tripId}
          tripGpsLocation={tripGpsLocation}
          onClose={() => setShowSensorUpload(false)}
        />
      )}
    </div>
  )
}

export default function DiveList({ tripId, tripGpsLocation }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [activeMedia, setActiveMedia] = useState(null)

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

    const srcDiveId = active.data.current?.diveId
    const dstDiveId = over.data.current?.diveId
    if (!srcDiveId || !dstDiveId) return
    if (srcDiveId === dstDiveId && String(over.id).startsWith('dive-drop-')) return

    if (srcDiveId === dstDiveId) {
      queryClient.setQueryData(['media', srcDiveId], (old = []) => {
        const oldIndex = old.findIndex(m => m._id === active.id)
        const newIndex = old.findIndex(m => m._id === over.id)
        if (oldIndex === -1 || newIndex === -1) return old
        const next = arrayMove(old, oldIndex, newIndex)
        api.patch('/media/reorder', { items: next.map((m, i) => ({ id: m._id, order: i })) })
          .catch(() => queryClient.invalidateQueries({ queryKey: ['media', srcDiveId] }))
        return next
      })
    } else {
      api.patch(`/media/${active.id}/move`, { diveId: dstDiveId })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['media', srcDiveId] })
          queryClient.invalidateQueries({ queryKey: ['media', dstDiveId] })
          toast.success('File moved to another dive')
        })
        .catch(() => toast.error('Failed to move file'))
    }
  }

  const { data: dives, isLoading } = useQuery({
    queryKey: ['dives', tripId],
    queryFn: () => api.get(`/trips/${tripId}/dives`).then(r => r.data),
    refetchInterval: 30000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/dives/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dives'] })
      toast.success('Dive deleted')
      setConfirmDelete(null)
    },
    onError: () => toast.error('Failed to delete dive')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const handleClose = () => { setEditing(null); setShowForm(false) }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-foreground">Dives</h2>
          {canEdit && (
            <p className="text-xs text-muted-foreground mt-0.5 [@media(hover:hover)]:hidden">
              Hold file to reorder · drag to another dive to move
            </p>
          )}
        </div>
        {canEdit && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors">
            <Plus size={14} /> Add Dive
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : dives?.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No dives yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-2">
            {dives?.map(dive => (
              <DiveCard
                key={dive._id}
                dive={dive}
                tripId={tripId}
                tripGpsLocation={tripGpsLocation}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={() => { setEditing(dive); setShowForm(true) }}
                onDelete={() => setConfirmDelete(dive)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeMedia?.media ? (
              <div className="w-24 aspect-square rounded-lg bg-card shadow-2xl opacity-90 flex flex-col items-center justify-center gap-1 border-2 border-primary">
                <File size={20} className="text-muted-foreground" />
                <p className="text-white text-xs px-2 truncate w-full text-center">
                  {activeMedia.media.originalName}
                </p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {showForm && <DiveForm tripId={tripId} diveData={editing} onClose={handleClose} />}

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
