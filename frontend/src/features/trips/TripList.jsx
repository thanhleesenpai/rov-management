import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FolderOpen, Pencil, Trash2, Upload, ChevronDown, ChevronRight, File, Eye, Activity, Waves, Navigation2, X, Loader } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext, pointerWithin, useSensor, useSensors, DragOverlay,
  useDroppable, useDndContext
} from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { MouseSensor, TouchSensor } from '@/lib/dnd-sensors'
import { arrayMove } from '@dnd-kit/sortable'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import { Skeleton } from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import MediaGallery from '@/features/media/MediaGallery'
import ROVDataUpload from './components/ROVDataUpload'
import { MarineButton } from '@/components/bespoke/MarineButton'
import { MarineTableActionMenu, MarineTableActionItem } from '@/components/bespoke/MarineTable'
import DataFilesModal from './components/DataFilesModal'

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

// ── Shared format helpers ─────────────────────────────────────────────────────
const fmtN   = n  => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
const fmtDur = ms => { if (!ms) return '—'; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m ${s % 60}s` }
const fmtTs  = ts => ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// ── DataFilesBar — compact pills + Manage button shown in expanded card ────────
function DataFilesBar({ tripId, tripTitle, canEdit }) {
  const [showModal, setShowModal] = useState(false)

  const { data: fileData } = useQuery({
    queryKey: ['data-files', tripId],
    queryFn: () => api.get(`/trips/${tripId}/data-files`).then(r => r.data),
    staleTime: 30_000,
  })

  const sensor = fileData?.sensor ?? []
  const dvl    = fileData?.dvl    ?? []
  const sonar  = fileData?.sonar  ?? []
  if (!fileData || sensor.length + dvl.length + sonar.length === 0) return null

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sensor.length > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full
                           bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-semibold">
            <Activity size={9} />
            {sensor.length}
            <span className="hidden sm:inline">Sensor</span>
          </span>
        )}
        {dvl.length > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full
                           bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] font-semibold">
            <Navigation2 size={9} />
            {dvl.length}
            <span className="hidden sm:inline">DVL</span>
          </span>
        )}
        {sonar.length > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full
                           bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 text-[10px] font-semibold">
            <Waves size={9} />
            {sonar.length}
            <span className="hidden sm:inline">Sonar</span>
          </span>
        )}
        <button onClick={() => setShowModal(true)}
          className="ml-auto px-2.5 py-1 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-full transition-colors font-medium shrink-0">
          Manage Files
        </button>
      </div>
      {showModal && (
        <DataFilesModal
          tripId={tripId}
          tripTitle={tripTitle}
          canEdit={canEdit}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

function TripCard({ trip, projectId, projectGpsLocation, canEdit, canDelete, onEdit, onDelete }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [showROVUpload, setShowROVUpload] = useState(false)
  const { text, cls, accent } = STATUS[trip.status] || STATUS.pending
  const canUpload = ['admin', 'operator'].includes(user?.role)

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `trip-card-${trip._id}`,
    data: { tripId: trip._id },
  })
  const { active } = useDndContext()
  const isDraggingFromOther = !!active?.data?.current?.tripId && active.data.current.tripId !== trip._id
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
    queryKey: ['media', trip._id],
    queryFn: () => api.get(`/media/trip/${trip._id}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const actualMedia = mediaList.filter(m => {
    const name = (m.originalName || '').toLowerCase()
    return !name.endsWith('.sonar') && !/^dvl_.*\.json$/.test(name.split('/').pop())
  })
  const mediaCount = actualMedia.length

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
            <div className="flex items-center flex-nowrap gap-2 w-full">
              <button onClick={() => setExpanded(v => !v)} className="flex-1 min-w-0 flex items-center flex-nowrap gap-2 text-left">
                <span className="shrink-0 text-muted-foreground">
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="text-sm font-medium text-foreground truncate block">{trip.title}</span>
              </button>

              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-semibold ${cls}`}>{text}</span>
              
              <div className="flex items-center gap-1.5 shrink-0">
                {mediaCount > 0 && (
                  <span className="text-xs font-mono text-muted-foreground flex items-center gap-0.5" title="Media files">
                    <File size={10} />{mediaCount}
                  </span>
                )}
                {(trip.sensorCount || 0) > 0 && (
                  <span className="text-primary flex items-center" title="Sensor data">
                    <Activity size={12} />
                  </span>
                )}
                {(trip.dvlCount || 0) > 0 && (
                  <span className="text-purple-500 dark:text-purple-400 flex items-center" title="DVL trajectory">
                    <Navigation2 size={12} />
                  </span>
                )}
                {(trip.sonarCount || 0) > 0 && (
                  <span className="text-cyan-600 dark:text-cyan-400 flex items-center" title="Sonar data">
                    <Waves size={12} />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-1" data-no-dnd onClick={e => e.stopPropagation()}>
                <div className="hidden sm:flex items-center gap-0.5">
                  <Link
                    to={`/trips/${trip._id}`}
                    state={{ from: `/projects/${projectId}` }}
                    title="View trip details"
                    className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted transition-colors"
                  >
                    <Eye size={14} />
                  </Link>
                  {canUpload && (
                    <button onClick={() => setShowROVUpload(true)} title="Upload data & media"
                      className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted transition-colors">
                      <Upload size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={onEdit}
                      className="p-2 text-muted-foreground hover:text-yellow-500 rounded-lg hover:bg-muted transition-colors">
                      <Pencil size={14} />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={onDelete}
                      className="p-2 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="sm:hidden flex items-center gap-1">
                  <MarineTableActionMenu>
                    <MarineTableActionItem onClick={() => navigate(`/trips/${trip._id}`, { state: { from: `/projects/${projectId}` } })}>
                      <Eye size={14} /> View Details
                    </MarineTableActionItem>
                    {canUpload && (
                      <MarineTableActionItem onClick={() => setShowROVUpload(true)}>
                        <Upload size={14} /> Upload Data
                      </MarineTableActionItem>
                    )}
                    {canEdit && (
                      <MarineTableActionItem onClick={onEdit}>
                        <Pencil size={14} /> Edit
                      </MarineTableActionItem>
                    )}
                    {canDelete && (
                      <MarineTableActionItem onClick={onDelete} className="text-destructive hover:text-destructive">
                        <Trash2 size={14} /> Delete
                      </MarineTableActionItem>
                    )}
                  </MarineTableActionMenu>
                </div>
              </div>
            </div>

            {trip.description && (
              <div className="flex items-center gap-1.5 w-full flex-nowrap text-muted-foreground text-xs mt-1.5 pl-6">
                <Upload size={11} className="shrink-0" />
                <span className="truncate">{trip.description}</span>
              </div>
            )}
          </div>

          {!expanded && mediaCount > 0 && (
            <div className="px-3 pb-2.5 flex items-center gap-1 ml-5">
              {actualMedia.slice(0, 3).map(m => (
                <MediaThumb key={m._id} media={m} />
              ))}
              {mediaCount > 3 && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium border border-border">
                  +{mediaCount - 3}
                </div>
              )}
            </div>
          )}

          {expanded && (
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
              {/* Data files bar: pills + Manage modal */}
              <DataFilesBar tripId={trip._id} tripTitle={trip.title} canEdit={canUpload} />
              {/* Media gallery */}
              <MediaGallery tripId={trip._id} />
            </div>
          )}
        </div>
      </div>

      {showROVUpload && (
        <ROVDataUpload
          trip={trip}
          onClose={() => setShowROVUpload(false)}
        />
      )}
    </div>
  )
}

export default function TripList({ projectId, projectGpsLocation }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showFolderImport, setShowFolderImport] = useState(false)
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

    const srcTripId = active.data.current?.tripId
    const dstTripId = over.data.current?.tripId
    if (!srcTripId || !dstTripId) return
    if (srcTripId === dstTripId && String(over.id).startsWith('trip-drop-')) return

    if (srcTripId === dstTripId) {
      queryClient.setQueryData(['media', srcTripId], (old = []) => {
        const oldIndex = old.findIndex(m => m._id === active.id)
        const newIndex = old.findIndex(m => m._id === over.id)
        if (oldIndex === -1 || newIndex === -1) return old
        const next = arrayMove(old, oldIndex, newIndex)
        api.patch('/media/reorder', { items: next.map((m, i) => ({ id: m._id, order: i })) })
          .catch(() => queryClient.invalidateQueries({ queryKey: ['media', srcTripId] }))
        return next
      })
    } else {
      api.patch(`/media/${active.id}/move`, { tripId: dstTripId })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['media', srcTripId] })
          queryClient.invalidateQueries({ queryKey: ['media', dstTripId] })
          toast.success('File moved to another trip')
        })
        .catch(() => toast.error('Failed to move file'))
    }
  }

  const { data: trips, isLoading } = useQuery({
    queryKey: ['trips', projectId],
    queryFn: () => api.get(`/projects/${projectId}/trips`).then(r => r.data),
    refetchInterval: 30000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/trips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.success('Trip deleted')
      setConfirmDelete(null)
    },
    onError: () => toast.error('Failed to delete trip')
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)
  const canDelete = user?.role === 'admin'
  const handleClose = () => { setEditing(null); setShowForm(false) }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-foreground">Trips</h2>
          {canEdit && (
            <p className="hidden sm:block text-xs text-muted-foreground mt-0.5">
              Hold file to reorder · drag to another trip to move
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <MarineButton variant="outline" icon={FolderOpen} onClick={() => setShowFolderImport(true)} className="max-sm:w-9 max-sm:px-0">
              <span className="hidden sm:inline">Import Folder</span>
            </MarineButton>
            <MarineButton variant="solid" icon={Plus} onClick={() => setShowForm(true)} className="max-sm:w-9 max-sm:px-0">
              <span className="hidden sm:inline">Add Trip</span>
            </MarineButton>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : trips?.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No trips yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-2">
            {trips?.map(trip => (
              <TripCard
                key={trip._id}
                trip={trip}
                projectId={projectId}
                projectGpsLocation={projectGpsLocation}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={() => { setEditing(trip); setShowForm(true) }}
                onDelete={() => setConfirmDelete(trip)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
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

      {showForm && <TripForm projectId={projectId} tripData={editing} onClose={handleClose} />}

      {showFolderImport && (
        <ROVDataUpload
          projectId={projectId}
          onClose={() => setShowFolderImport(false)}
          onTripCreated={() => queryClient.invalidateQueries({ queryKey: ['trips', projectId] })}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Trip"
          message={`Are you sure you want to delete "${confirmDelete.title}"?`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
