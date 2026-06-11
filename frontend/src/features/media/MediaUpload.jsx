import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, X, CheckCircle, AlertCircle, FileVideo, FileImage, File, Clock } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

// Windows can report empty file.type for .mov/.avi — fall back to extension map
const EXT_MIME = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', m4a: 'audio/mp4',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
}
const resolveMime = (file) => {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  return EXT_MIME[ext] || file.type
}

const formatSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const FileIcon = ({ type }) => {
  if (type?.startsWith('video/')) return <FileVideo size={20} className="text-primary" />
  if (type?.startsWith('image/')) return <FileImage size={20} className="text-green-500" />
  return <File size={20} className="text-muted-foreground" />
}

// Upload 1 file: presigned URL → PUT S3 → confirm
const uploadFile = async ({ file, diveId, tripId, recordedAt, onProgress }) => {
  const mimeType = resolveMime(file)
  const { uploadUrl, media } = await api.post('/media/presigned-url', {
    diveId, tripId,
    fileName: file.name,
    mimeType,
    size: file.size,
    ...(recordedAt && { recordedAt: new Date(recordedAt).toISOString() }),
  }).then(r => r.data)

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error(`S3 error: ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', mimeType)
    xhr.send(file)
  })

  await api.patch(`/media/${media._id}/confirm`)
  return media
}

export default function MediaUpload({ diveId, tripId, onClose }) {
  const queryClient = useQueryClient()
  const [files, setFiles] = useState([]) // [{ file, status, progress, error, recordedAt }]

  const setFileField = (idx, field, value) =>
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f))

  const ROV_DATA_EXTS = /\.(sonar|csv|json)$/i

  const onDrop = useCallback((accepted, rejected) => {
    rejected.forEach(({ file, errors }) => {
      const msg = errors[0]?.code === 'file-too-large'
        ? `${file.name}: Vượt quá 500MB`
        : `${file.name}: Không hỗ trợ định dạng này`
      toast.error(msg)
    })
    const [rovFiles, mediaFiles] = accepted.reduce(
      ([rov, med], f) => ROV_DATA_EXTS.test(f.name) ? [[...rov, f], med] : [rov, [...med, f]],
      [[], []]
    )
    if (rovFiles.length > 0)
      toast.warning(`${rovFiles.map(f => f.name).join(', ')}: Dùng nút Upload ROV Data (icon ổ cứng) để upload file này`)
    const newFiles = mediaFiles.map(file => ({
      file, status: 'idle', progress: 0, error: null, recordedAt: '',
    }))
    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: MAX_SIZE,
    accept: {
      'video/*': ['.mp4', '.webm', '.mov', '.avi'],
      'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
      'application/pdf': ['.pdf'],
      'audio/mp4': ['.m4a', '.mp4'],
    }
  })

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const uploadAll = async () => {
    const pending = files.filter(f => f.status === 'idle')
    if (!pending.length) return

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'idle') continue

      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f))

      try {
        await uploadFile({
          file: files[i].file,
          diveId, tripId,
          recordedAt: files[i].recordedAt,
          onProgress: (progress) => {
            setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, progress } : f))
          }
        })
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done', progress: 100 } : f))
      } catch (err) {
        const msg = err.message || 'Upload failed'
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: msg } : f))
        toast.error(`${files[i].file.name}: ${msg}`)
      }
    }

    queryClient.invalidateQueries({ queryKey: ['media', diveId] })
    const doneCount  = files.filter(f => f.status === 'done').length
    const errorCount = files.filter(f => f.status === 'error').length
    if (doneCount > 0 && errorCount === 0) toast.success(`${doneCount} file(s) uploaded successfully`)
    else if (doneCount > 0) toast.warning(`${doneCount} uploaded, ${errorCount} failed`)
  }

  const hasPending = files.some(f => f.status === 'idle')
  const isUploading = files.some(f => f.status === 'uploading')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Upload Files</h2>
          <button onClick={onClose} disabled={isUploading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary hover:bg-muted'
            }`}
          >
            <input {...getInputProps()} />
            <Upload size={28} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-foreground">
              {isDragActive ? 'Thả file vào đây...' : 'Kéo thả hoặc click để chọn file'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Video, ảnh, PDF · Tối đa 500MB mỗi file</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((f, idx) => (
                <div key={idx} className="bg-muted rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <FileIcon type={resolveMime(f.file)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.file.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">{formatSize(f.file.size)}</p>
                        {f.status === 'uploading' && (
                          <>
                            <div className="flex-1 bg-border rounded-full h-1">
                              <div className="bg-primary h-1 rounded-full transition-all"
                                style={{ width: `${f.progress}%` }} />
                            </div>
                            <span className="text-xs text-primary">{f.progress}%</span>
                          </>
                        )}
                        {f.status === 'error' && (
                          <span className="text-xs text-destructive">{f.error}</span>
                        )}
                      </div>
                    </div>
                    {f.status === 'done'  && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                    {f.status === 'error' && <AlertCircle size={16} className="text-destructive shrink-0" />}
                    {f.status === 'idle'  && !isUploading && (
                      <button onClick={() => removeFile(idx)}
                        className="text-muted-foreground/50 hover:text-destructive shrink-0">
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {/* recordedAt input for video files */}
                  {resolveMime(f.file).startsWith('video/') && f.status === 'idle' && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                        <Clock size={10} />
                        Recording start time
                        <span className="text-muted-foreground/60">(optional — enables chart sync)</span>
                      </label>
                      <input
                        type="datetime-local"
                        step="1"
                        value={f.recordedAt}
                        onChange={e => setFileField(idx, 'recordedAt', e.target.value)}
                        className="w-full text-xs px-2 py-1 rounded border border-input bg-background
                                   text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} disabled={isUploading}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40">
            {files.every(f => f.status === 'done') ? 'Close' : 'Cancel'}
          </button>
          {hasPending && (
            <button onClick={uploadAll} disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground
                         text-sm rounded-lg hover:bg-primary/90 disabled:opacity-60">
              <Upload size={14} />
              {isUploading
                ? 'Uploading...'
                : `Upload ${files.filter(f => f.status === 'idle').length} file(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
