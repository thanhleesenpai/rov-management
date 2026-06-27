import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Navigation2, Waves, X, Trash2, Loader } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

const fmtN   = n  => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
const fmtDur = ms => { if (!ms) return '—'; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m ${s % 60}s` }
const fmtTs  = ts => ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function SectionHeader({ icon: Icon, iconCls, title, count }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={13} className={iconCls} />
      <span className="text-xs font-semibold text-foreground">{title}</span>
      <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">{count}</span>
    </div>
  )
}

function DelBtn({ loading, onClick }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-40 shrink-0">
      {loading ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
    </button>
  )
}

export default function DataFilesModal({ tripId, tripTitle, canEdit, onClose }) {
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const { data: fileData, isLoading } = useQuery({
    queryKey: ['data-files', tripId],
    queryFn: () => api.get(`/trips/${tripId}/data-files`).then(r => r.data),
    staleTime: 30_000,
  })

  const sensor = fileData?.sensor ?? []
  const dvl    = fileData?.dvl    ?? []
  const sonar  = fileData?.sonar  ?? []

  const allKeys = useMemo(() => [
    ...sensor.map(f => `sensor::${f.sourceFile}`),
    ...dvl.map(f => `dvl::${f.sourceFile}`),
    ...sonar.map(f => `sonar::${f._id}`),
  ], [sensor, dvl, sonar])

  const allSelected = allKeys.length > 0 && selected.size === allKeys.length
  const toggleItem = (key) => setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  const toggleAll  = () => setSelected(allSelected ? new Set() : new Set(allKeys))
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()) }

  const overlapping = useMemo(() => {
    const set = new Set()
    for (let i = 0; i < sensor.length; i++) {
      for (let j = i + 1; j < sensor.length; j++) {
        const a = sensor[i], b = sensor[j]
        if (a.minTs && a.maxTs && b.minTs && b.maxTs) {
          if (new Date(a.minTs) < new Date(b.maxTs) && new Date(b.minTs) < new Date(a.maxTs)) {
            set.add(a.sourceFile); set.add(b.sourceFile)
          }
        }
      }
    }
    return set
  }, [sensor])

  const execDelete = async () => {
    if (!confirmDelete) return
    const { type, file, id } = confirmDelete
    const key = `${type}-${file}`
    setDeleting(key)
    setConfirmDelete(null)
    try {
      if (type === 'sensor') {
        await api.delete(`/trips/${tripId}/sensor-data?file=${encodeURIComponent(file)}`)
        queryClient.invalidateQueries({ queryKey: ['sensor', tripId] })
      } else if (type === 'dvl') {
        await api.delete(`/trips/${tripId}/dvl?file=${encodeURIComponent(file)}`)
        queryClient.invalidateQueries({ queryKey: ['dvl-path', tripId] })
      } else {
        await api.delete(`/trips/${tripId}/sonar/${id}`)
        queryClient.invalidateQueries({ queryKey: ['sonar-list', tripId] })
      }
      queryClient.invalidateQueries({ queryKey: ['data-files', tripId] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
    } catch { toast.error('Failed to delete file') }
    finally { setDeleting(null) }
  }

  const execBulkDelete = async () => {
    setBulkDeleting(true)
    setConfirmBulkDelete(false)
    const invalidations = new Set()
    await Promise.allSettled([...selected].map(key => {
      const sep = key.indexOf('::')
      const type = key.slice(0, sep)
      const identifier = key.slice(sep + 2)
      if (type === 'sensor') { invalidations.add('sensor'); return api.delete(`/trips/${tripId}/sensor-data?file=${encodeURIComponent(identifier)}`) }
      if (type === 'dvl')    { invalidations.add('dvl');    return api.delete(`/trips/${tripId}/dvl?file=${encodeURIComponent(identifier)}`) }
      invalidations.add('sonar'); return api.delete(`/trips/${tripId}/sonar/${identifier}`)
    }))
    if (invalidations.has('sensor')) queryClient.invalidateQueries({ queryKey: ['sensor', tripId] })
    if (invalidations.has('dvl'))    queryClient.invalidateQueries({ queryKey: ['dvl-path', tripId] })
    if (invalidations.has('sonar'))  queryClient.invalidateQueries({ queryKey: ['sonar-list', tripId] })
    queryClient.invalidateQueries({ queryKey: ['data-files', tripId] })
    queryClient.invalidateQueries({ queryKey: ['trips'] })
    setSelected(new Set())
    setSelectMode(false)
    setBulkDeleting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-2xl border border-border flex flex-col max-h-[90svh] sm:max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border shrink-0">
          {!selectMode ? (
            <>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-foreground text-sm">Data Files</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{tripTitle}</p>
              </div>
              {canEdit && allKeys.length > 0 && (
                <button onClick={() => setSelectMode(true)}
                  className="px-2.5 py-1 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-full transition-colors font-medium shrink-0">
                  Select
                </button>
              )}
              <button onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleAll}
                className="px-2.5 py-1 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-full transition-colors font-medium shrink-0">
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="flex-1 text-xs text-muted-foreground text-center">
                {selected.size > 0 ? `${selected.size} selected` : 'Tap rows to select'}
              </span>
              {selected.size > 0 && (
                <button onClick={() => setConfirmBulkDelete(true)} disabled={bulkDeleting}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-white bg-destructive hover:bg-destructive/90 rounded-full transition-colors font-medium shrink-0 disabled:opacity-50">
                  <Trash2 size={11} /> Delete ({selected.size})
                </button>
              )}
              <button onClick={exitSelect}
                className="px-2.5 py-1 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-full transition-colors font-medium shrink-0">
                Cancel
              </button>
            </>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-5">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Sensor Files */}
          {sensor.length > 0 && (
            <div>
              <SectionHeader icon={Activity} iconCls="text-blue-500" title="Sensor Logs" count={sensor.length} />
              <div className="space-y-1">
                {sensor.map(f => {
                  const isOverlap = overlapping.has(f.sourceFile)
                  const key = `sensor::${f.sourceFile}`
                  const isSel = selected.has(key)
                  return (
                    <div key={f.sourceFile}
                      onClick={selectMode ? () => toggleItem(key) : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${selectMode ? 'cursor-pointer' : ''} ${
                        isSel ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : isOverlap ? 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10'
                        : 'border-border bg-muted/30'
                      }`}>
                      {selectMode
                        ? <input type="checkbox" readOnly checked={isSel} className="shrink-0 accent-primary w-3.5 h-3.5" />
                        : <Activity size={13} className="text-blue-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-foreground truncate">{f.sourceFile}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {fmtN(f.count)} rows · {fmtTs(f.minTs)} → {fmtTs(f.maxTs)}
                          {isOverlap && <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-semibold">⚠ Overlap</span>}
                        </p>
                      </div>
                      {!selectMode && canEdit && <DelBtn loading={deleting === `sensor-${f.sourceFile}`} onClick={() => setConfirmDelete({ type: 'sensor', file: f.sourceFile, name: f.sourceFile })} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* DVL Files */}
          {dvl.length > 0 && (
            <div>
              <SectionHeader icon={Navigation2} iconCls="text-purple-500" title="DVL Trajectory" count={dvl.length} />
              <div className="space-y-1">
                {dvl.map(f => {
                  const key = `dvl::${f.sourceFile}`
                  const isSel = selected.has(key)
                  return (
                    <div key={f.sourceFile}
                      onClick={selectMode ? () => toggleItem(key) : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${selectMode ? 'cursor-pointer' : ''} ${
                        isSel ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border bg-muted/30'
                      }`}>
                      {selectMode
                        ? <input type="checkbox" readOnly checked={isSel} className="shrink-0 accent-primary w-3.5 h-3.5" />
                        : <Navigation2 size={13} className="text-purple-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-foreground truncate">{f.sourceFile}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{fmtN(f.count)} points</p>
                      </div>
                      {!selectMode && canEdit && <DelBtn loading={deleting === `dvl-${f.sourceFile}`} onClick={() => setConfirmDelete({ type: 'dvl', file: f.sourceFile, name: f.sourceFile })} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sonar Files */}
          {sonar.length > 0 && (
            <div>
              <SectionHeader icon={Waves} iconCls="text-cyan-500" title="Sonar Scans" count={sonar.length} />
              <div className="space-y-1">
                {sonar.map(f => {
                  const key = `sonar::${f._id}`
                  const isSel = selected.has(key)
                  return (
                    <div key={f._id}
                      onClick={selectMode ? () => toggleItem(key) : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${selectMode ? 'cursor-pointer' : ''} ${
                        isSel ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border bg-muted/30'
                      }`}>
                      {selectMode
                        ? <input type="checkbox" readOnly checked={isSel} className="shrink-0 accent-primary w-3.5 h-3.5" />
                        : <Waves size={13} className="text-cyan-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-foreground truncate">{f.filename}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {fmtN(f.frameCount)} frames · {fmtDur(f.durationMs)}
                          {f.recordedAt && <> · {fmtTs(f.recordedAt)}</>}
                        </p>
                      </div>
                      {!selectMode && canEdit && <DelBtn loading={deleting === `sonar-${f._id}`} onClick={() => setConfirmDelete({ type: 'sonar', file: f.filename, id: f._id, name: f.filename })} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!isLoading && sensor.length + dvl.length + sonar.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-10">No data files attached to this trip.</p>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete File"
          message={`Remove "${confirmDelete.name}" and all its data? This cannot be undone.`}
          loading={!!deleting}
          onConfirm={execDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selected.size} file${selected.size > 1 ? 's' : ''}`}
          message={`Remove ${selected.size} selected file${selected.size > 1 ? 's' : ''} and all their data? This cannot be undone.`}
          loading={bulkDeleting}
          onConfirm={execBulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  )
}
