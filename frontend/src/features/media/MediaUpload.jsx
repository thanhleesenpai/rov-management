import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, X, CheckCircle, AlertCircle, FileVideo, FileImage, File } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

const formatSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const FileIcon = ({ type }) => {
  if (type?.startsWith('video/')) return <FileVideo size={20} className="text-blue-500" />
  if (type?.startsWith('image/')) return <FileImage size={20} className="text-green-500" />
  return <File size={20} className="text-gray-400" />
}

// Upload 1 file: presigned URL → PUT S3 → confirm
const uploadFile = async ({ file, jobId, tripId, onProgress }) => {
  // Bước 1: lấy presigned URL
  const { uploadUrl, media } = await api.post('/media/presigned-url', {
    jobId, tripId,
    fileName: file.name,
    mimeType: file.type,
    size: file.size
  }).then(r => r.data)

  // Bước 2: PUT thẳng lên S3 với progress
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error(`S3 error: ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })

  // Bước 3: confirm
  await api.patch(`/media/${media._id}/confirm`)
  return media
}

export default function MediaUpload({ jobId, tripId, onClose }) {
  const queryClient = useQueryClient()
  const [files, setFiles] = useState([]) // [{ file, status, progress, error }]

  const onDrop = useCallback((accepted, rejected) => {
    rejected.forEach(({ file, errors }) => {
      const msg = errors[0]?.code === 'file-too-large'
        ? `${file.name}: Vượt quá 500MB`
        : `${file.name}: Không hỗ trợ định dạng này`
      toast.error(msg)
    })
    const newFiles = accepted.map(file => ({ file, status: 'idle', progress: 0, error: null }))
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
          jobId, tripId,
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

    queryClient.invalidateQueries({ queryKey: ['media', jobId] })
    const doneCount  = files.filter(f => f.status === 'done').length
    const errorCount = files.filter(f => f.status === 'error').length
    if (doneCount > 0 && errorCount === 0) toast.success(`${doneCount} file(s) uploaded successfully`)
    else if (doneCount > 0) toast.warning(`${doneCount} uploaded, ${errorCount} failed`)
  }

  const hasPending = files.some(f => f.status === 'idle')
  const isUploading = files.some(f => f.status === 'uploading')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Upload Files</h2>
          <button onClick={onClose} disabled={isUploading} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-600">
              {isDragActive ? 'Thả file vào đây...' : 'Kéo thả hoặc click để chọn file'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Video, ảnh, PDF · Tối đa 500MB mỗi file</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {files.map(({ file, status, progress, error }, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <FileIcon type={file.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                      {status === 'uploading' && (
                        <>
                          <div className="flex-1 bg-gray-200 rounded-full h-1">
                            <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-blue-600">{progress}%</span>
                        </>
                      )}
                      {status === 'error' && <span className="text-xs text-red-500">{error}</span>}
                    </div>
                  </div>
                  {status === 'done' && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                  {status === 'error' && <AlertCircle size={16} className="text-red-500 shrink-0" />}
                  {status === 'idle' && !isUploading && (
                    <button onClick={() => removeFile(idx)} className="text-gray-300 hover:text-red-500 shrink-0">
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose} disabled={isUploading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-40">
            {files.every(f => f.status === 'done') ? 'Close' : 'Cancel'}
          </button>
          {hasPending && (
            <button onClick={uploadAll} disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Upload size={14} />
              {isUploading ? 'Uploading...' : `Upload ${files.filter(f => f.status === 'idle').length} file(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
