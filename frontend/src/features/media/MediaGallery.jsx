import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Trash2, X, ChevronLeft, ChevronRight, Loader, File, FileText, Download, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDndContext } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'm4v', 'm4a']
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

const resolveType = (media) => {
  if (media.type === 'video' || media.type === 'image' || media.type === 'document') return media.type
  const ext = media.originalName?.split('.').pop()?.toLowerCase()
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (ext === 'pdf') return 'document'
  return 'other'
}

const formatSize = (bytes) => {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const TABS = [
  { id: 'all',      label: 'All' },
  { id: 'video',    label: 'Videos' },
  { id: 'image',    label: 'Images' },
  { id: 'document', label: 'Docs' },
]

// ─── Hook lấy presigned URL (cache 50 phút) ───────────────────────────────
function useMediaUrl(mediaId) {
  return useQuery({
    queryKey: ['media-url', mediaId],
    queryFn: () => api.get(`/media/${mediaId}/url`).then(r => r.data.url),
    staleTime: 50 * 60 * 1000,
    enabled: !!mediaId,
  })
}

// ─── Card ảnh ────────────────────────────────────────────────────────────
function ImageCard({ media, onClick, onDelete, canDelete, selectMode, selected, onSelect }) {
  const { data: url, isLoading } = useMediaUrl(media._id)

  return (
    <div className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
      onClick={selectMode ? onSelect : onClick}>
      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader size={20} className="text-gray-300 animate-spin" />
        </div>
      ) : (
        <img src={url} alt={media.originalName}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
      )}
      {!selectMode && <Overlay media={media} url={url} canDelete={canDelete} onDelete={onDelete} />}
      {selectMode && <SelectOverlay selected={selected} />}
    </div>
  )
}

// ─── Card video ───────────────────────────────────────────────────────────
function VideoCard({ media, onClick, onDelete, canDelete, selectMode, selected, onSelect }) {
  const { data: url, isLoading } = useMediaUrl(media._id)
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const cardRef = useRef(null)
  const isTouch = useRef(window.matchMedia('(hover: none)').matches)

  const handleMouseEnter = () => {
    if (isTouch.current || selectMode) return
    setPlaying(true)
    if (videoRef.current && url) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => {}) }
  }
  const handleMouseLeave = () => {
    if (isTouch.current) return
    setPlaying(false)
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }
  }

  useEffect(() => {
    if (!isTouch.current) return
    const handler = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        setPlaying(false)
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }
      }
    }
    document.addEventListener('touchstart', handler)
    return () => document.removeEventListener('touchstart', handler)
  }, [])

  const handleClick = () => {
    if (selectMode) { onSelect(); return }
    if (!isTouch.current) { onClick(); return }
    if (!playing) {
      if (videoRef.current && url) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => {}) }
      setPlaying(true)
    } else {
      onClick()
    }
  }

  return (
    <div ref={cardRef}
      className="group relative aspect-square rounded-lg overflow-hidden bg-gray-900 cursor-pointer"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}>

      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader size={20} className="text-gray-500 animate-spin" />
        </div>
      ) : (
        <video ref={videoRef} src={url} muted playsInline loop
          className="w-full h-full object-cover" />
      )}

      {!playing && !selectMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
            <Play size={18} className="text-white ml-0.5" />
          </div>
        </div>
      )}

      {playing && !selectMode && (
        <div className="absolute bottom-0 left-0 right-0 py-1.5 flex items-center justify-center
                        bg-gradient-to-t from-black/60 to-transparent
                        [@media(hover:hover)]:hidden">
          <p className="text-white/80 text-xs">Tap to open</p>
        </div>
      )}

      {!selectMode && <Overlay media={media} url={url} canDelete={canDelete} onDelete={onDelete} />}
      {selectMode && <SelectOverlay selected={selected} />}
    </div>
  )
}

// ─── Card tài liệu ───────────────────────────────────────────────────────
function DocCard({ media, onClick, onDelete, canDelete, selectMode, selected, onSelect }) {
  const { data: url } = useMediaUrl(media._id)
  return (
    <div className="group relative aspect-square rounded-lg overflow-hidden bg-gray-50 border border-gray-200 cursor-pointer flex flex-col items-center justify-center gap-2"
      onClick={selectMode ? onSelect : onClick}>
      <FileText size={32} className="text-gray-400" />
      <p className="text-xs text-gray-500 text-center px-2 truncate w-full">{media.originalName}</p>
      {!selectMode && <Overlay media={media} url={url} canDelete={canDelete} onDelete={onDelete} />}
      {selectMode && <SelectOverlay selected={selected} />}
    </div>
  )
}

// ─── Select overlay ───────────────────────────────────────────────────────
function SelectOverlay({ selected }) {
  return (
    <div className={`absolute inset-0 transition-colors ${selected ? 'bg-blue-500/30' : 'bg-black/0 hover:bg-black/10'}`}>
      <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
        selected ? 'bg-blue-500 border-blue-500' : 'bg-white/70 border-white'
      }`}>
        {selected && <CheckCircle2 size={14} className="text-white" strokeWidth={3} />}
      </div>
    </div>
  )
}

// ─── Download helper ─────────────────────────────────────────────────────
function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.target = '_blank'
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─── Overlay chung ────────────────────────────────────────────────────────
function Overlay({ media, url, canDelete, onDelete }) {
  const handleDownload = (e) => {
    e.stopPropagation()
    if (url) triggerDownload(url, media.originalName)
  }
  const handleDelete = (e) => { e.stopPropagation(); onDelete() }

  return (
    <>
      {/* Desktop hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors
                      hidden [@media(hover:hover)]:block pointer-events-none group-hover:pointer-events-auto">
        <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
          <div className="flex items-end justify-between gap-1">
            <div className="min-w-0">
              <p className="text-white text-xs truncate leading-tight">{media.originalName}</p>
              <p className="text-white/60 text-xs">{formatSize(media.size)}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {url && (
                <button data-no-dnd onClick={handleDownload}
                  className="p-1 bg-black/60 hover:bg-black/80 rounded transition-colors" title="Download">
                  <Download size={11} className="text-white" />
                </button>
              )}
              {canDelete && (
                <button data-no-dnd onClick={handleDelete}
                  className="p-1 bg-red-500 hover:bg-red-600 rounded transition-colors">
                  <Trash2 size={11} className="text-white" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile persistent action bar */}
      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1
                      flex items-center justify-between gap-1
                      bg-gradient-to-t from-black/60 to-transparent
                      [@media(hover:hover)]:hidden">
        <p className="text-white text-xs truncate leading-tight min-w-0">{media.originalName}</p>
        <div className="flex gap-1 shrink-0">
          {url && (
            <button data-no-dnd onClick={handleDownload}
              className="p-1 bg-black/50 active:bg-black/80 rounded" title="Download">
              <Download size={11} className="text-white" />
            </button>
          )}
          {canDelete && (
            <button data-no-dnd onClick={handleDelete}
              className="p-1 bg-red-500/80 active:bg-red-600 rounded">
              <Trash2 size={11} className="text-white" />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────
function Lightbox({ mediaList, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex)
  const [visible, setVisible] = useState(false)
  const media = mediaList[index]
  const { data: url, isLoading } = useMediaUrl(media?._id)

  const prev = () => setIndex(i => (i - 1 + mediaList.length) % mediaList.length)
  const next = () => setIndex(i => (i + 1) % mediaList.length)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mediaList.length])

  return (
    <div className={`fixed inset-0 flex items-center justify-center z-50 transition-colors duration-200 ${visible ? 'bg-black/90' : 'bg-black/0'}`}
      onClick={onClose}>
      <div className={`relative max-w-5xl w-full max-h-[90vh] px-4 sm:px-16 transition-all duration-200 ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onClick={e => e.stopPropagation()}>

        <button onClick={onClose}
          className="absolute -top-10 right-4 text-white/60 hover:text-white transition-colors">
          <X size={24} />
        </button>

        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-white/50 text-sm">
          {index + 1} / {mediaList.length}
        </div>

        {mediaList.length > 1 && (
          <button onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
            <ChevronLeft size={20} className="text-white" />
          </button>
        )}

        <div className="flex items-center justify-center min-h-48">
          {isLoading ? (
            <Loader size={36} className="text-white/40 animate-spin" />
          ) : resolveType(media) === 'video' ? (
            <video key={url} src={url} controls autoPlay
              className="max-w-full max-h-[80vh] rounded-lg" />
          ) : resolveType(media) === 'image' ? (
            <img key={url} src={url} alt={media.originalName}
              className="max-w-full max-h-[80vh] object-contain rounded-lg" />
          ) : (
            <div className="bg-white rounded-xl p-8 text-center">
              <File size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-600 text-sm mb-4">{media?.originalName}</p>
              <a href={url} target="_blank" rel="noreferrer"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                Open File
              </a>
            </div>
          )}
        </div>

        {mediaList.length > 1 && (
          <button onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
            <ChevronRight size={20} className="text-white" />
          </button>
        )}

        <p className="text-center text-white/50 text-xs mt-3">{media?.originalName}</p>

        {mediaList.length > 1 && (
          <div className="flex gap-2 justify-center mt-3 overflow-x-auto pb-1">
            {mediaList.map((m, i) => (
              <button key={m._id} onClick={() => setIndex(i)}
                className={`w-12 h-12 rounded-md overflow-hidden shrink-0 border-2 transition-colors ${
                  i === index ? 'border-blue-500' : 'border-transparent opacity-50 hover:opacity-80'
                }`}>
                <ThumbnailStrip media={m} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ThumbnailStrip({ media }) {
  const { data: url } = useMediaUrl(media._id)
  const type = resolveType(media)

  if (type === 'image' && url) return <img src={url} alt="" className="w-full h-full object-cover" />
  if (type === 'video' && url) return (
    <video src={url} className="w-full h-full object-cover" muted playsInline
      onLoadedMetadata={e => { e.target.currentTime = 1 }} />
  )
  return (
    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
      <File size={14} className="text-gray-400" />
    </div>
  )
}

// ─── Sortable wrapper ────────────────────────────────────────────────────
function SortableCard({ media, jobId, canDrag, canDelete, onClick, onDelete, selectMode, selected, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: media._id,
    data: { jobId, media },
    disabled: !canDrag || selectMode,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    touchAction: canDrag && !selectMode ? 'none' : undefined,
  }

  const t = resolveType(media)
  const props = { media, canDelete, onClick, onDelete, selectMode, selected, onSelect }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {t === 'video' ? <VideoCard {...props} /> : t === 'image' ? <ImageCard {...props} /> : <DocCard {...props} />}
    </div>
  )
}

// ─── Ghost card khi kéo từ job khác vào ──────────────────────────────────
function CrossJobGhost({ media }) {
  const { data: url } = useMediaUrl(media?._id)
  const t = resolveType(media ?? {})

  return (
    <div className="aspect-square rounded-lg overflow-hidden opacity-50 pointer-events-none ring-2 ring-blue-400">
      {t === 'video' ? (
        <div className="relative w-full h-full bg-gray-900">
          {url && <video src={url} muted className="w-full h-full object-cover" />}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
              <Play size={18} className="text-white ml-0.5" />
            </div>
          </div>
        </div>
      ) : t === 'image' ? (
        <img src={url} alt={media?.originalName} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center gap-2">
          <FileText size={32} className="text-gray-400" />
          <p className="text-xs text-gray-500 text-center px-2 truncate w-full">{media?.originalName}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Gallery ─────────────────────────────────────────────────────────
export default function MediaGallery({ jobId }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('all')
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const { data: allMedia = [], isLoading } = useQuery({
    queryKey: ['media', jobId],
    queryFn: () => api.get(`/media/job/${jobId}`).then(r => r.data),
    enabled: !!jobId
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/media/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', jobId] })
      toast.success('File deleted')
    },
    onError: () => toast.error('Failed to delete file')
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => api.delete('/media/bulk', { data: { ids } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['media', jobId] })
      toast.success(`${res.data?.deleted ?? selected.size} file(s) deleted`)
      setSelected(new Set())
      setSelectMode(false)
      setConfirmBulkDelete(false)
    },
    onError: () => toast.error('Failed to delete files')
  })

  const canDelete = user?.role === 'admin'
  const canDrag = ['admin', 'operator'].includes(user?.role)

  const filtered = tab === 'all' ? allMedia : allMedia.filter(m => resolveType(m) === tab)

  const [orderedMedia, setOrderedMedia] = useState([])
  useEffect(() => {
    setOrderedMedia(filtered)
    // Clear selection when filter changes
    setSelected(new Set())
  }, [allMedia, tab])

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === orderedMedia.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orderedMedia.map(m => m._id)))
    }
  }

  const { active, over } = useDndContext()
  const showCrossJobPlaceholder =
    active?.data?.current?.jobId &&
    active.data.current.jobId !== jobId &&
    over?.data?.current?.jobId === jobId

  if (isLoading) return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )

  if (allMedia.length === 0) return (
    <p className="text-xs text-gray-400 mt-2 text-center py-2">No files uploaded yet.</p>
  )

  const allSelected = orderedMedia.length > 0 && selected.size === orderedMedia.length

  return (
    <div className="mt-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        {/* Tabs (hidden in select mode) */}
        {!selectMode ? (
          <div className="flex gap-1 flex-wrap">
            {TABS.filter(t => t.id === 'all' || allMedia.some(m => resolveType(m) === t.id)).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {t.label}
                <span className="ml-1 opacity-70">
                  {t.id === 'all' ? allMedia.length : allMedia.filter(m => resolveType(m) === t.id).length}
                </span>
              </button>
            ))}
          </div>
        ) : (
          /* Select mode header */
          <div className="flex items-center gap-2">
            <button onClick={selectAll}
              className="text-xs px-2.5 py-1 rounded-full border font-medium transition-colors bg-white border-gray-300 text-gray-700 hover:bg-gray-50">
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            {selected.size > 0 && (
              <span className="text-xs text-gray-500 font-medium">{selected.size} selected</span>
            )}
          </div>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!selectMode ? (
            <>
              {canDrag && orderedMedia.length > 1 && (
                <p className="text-xs text-gray-400 [@media(hover:hover)]:hidden">Hold to reorder</p>
              )}
              {canDelete && (
                <button data-no-dnd onClick={() => setSelectMode(true)}
                  className="px-2.5 py-1 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors font-medium">
                  Select
                </button>
              )}
            </>
          ) : (
            <>
              {selected.size > 0 && (
                <button data-no-dnd onClick={() => setConfirmBulkDelete(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors font-medium">
                  <Trash2 size={11} /> Delete ({selected.size})
                </button>
              )}
              <button data-no-dnd onClick={exitSelectMode}
                className="px-2.5 py-1 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors font-medium">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      {orderedMedia.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No {tab}s uploaded.</p>
      ) : (
        <SortableContext items={orderedMedia.map(m => m._id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {orderedMedia.map((media, i) => (
              <SortableCard
                key={media._id}
                media={media}
                jobId={jobId}
                canDrag={canDrag}
                canDelete={canDelete}
                onClick={() => setLightboxIndex(i)}
                onDelete={() => setConfirmDelete(media)}
                selectMode={selectMode}
                selected={selected.has(media._id)}
                onSelect={() => toggleSelect(media._id)}
              />
            ))}
            {showCrossJobPlaceholder && (
              <CrossJobGhost media={active.data.current.media} />
            )}
          </div>
        </SortableContext>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && !selectMode && (
        <Lightbox
          mediaList={filtered}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Confirm single delete */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete File"
          message={`Are you sure you want to delete "${confirmDelete.originalName}"?`}
          loading={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.mutate(confirmDelete._id)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Confirm bulk delete */}
      {confirmBulkDelete && (
        <ConfirmDialog
          title="Delete Files"
          message={`Are you sure you want to delete ${selected.size} file(s)? This cannot be undone.`}
          loading={bulkDeleteMutation.isPending}
          onConfirm={() => bulkDeleteMutation.mutate([...selected])}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  )
}
