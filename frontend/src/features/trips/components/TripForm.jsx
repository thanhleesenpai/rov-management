import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'

export default function TripForm({ tripData, onClose }) {
  const queryClient = useQueryClient()
  const isEdit = !!tripData

  const [form, setForm] = useState({
    name: tripData?.name || '',
    description: tripData?.description || '',
    rov: tripData?.rov?._id || tripData?.rov || '',
    location: tripData?.location || '',
    startTime: tripData?.startTime ? tripData.startTime.slice(0, 16) : '',
    endTime: tripData?.endTime ? tripData.endTime.slice(0, 16) : '',
    status: tripData?.status || 'planned'
  })
  const [error, setError] = useState('')

  const { data: rovs } = useQuery({
    queryKey: ['rovs'],
    queryFn: () => api.get('/rovs').then(r => r.data)
  })

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit ? api.patch(`/trips/${tripData._id}`, data) : api.post('/trips', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.success(isEdit ? 'Trip updated' : 'Trip created')
      onClose()
    },
    onError: (err) => setError(err.message || 'Something went wrong')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    mutation.mutate({ ...form, startTime: form.startTime || null, endTime: form.endTime || null })
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const field = (label, children) => (
    <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">{isEdit ? 'Edit Trip' : 'New Trip'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>}

          {field('Trip Name', (
            <input type="text" required value={form.name} className={inputCls}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          ))}

          {field('ROV', (
            <select required value={form.rov} className={inputCls}
              onChange={e => setForm(f => ({ ...f, rov: e.target.value }))}>
              <option value="">-- Select ROV --</option>
              {rovs?.filter(r => r.status === 'active').map(r => (
                <option key={r._id} value={r._id}>{r.name} ({r.model})</option>
              ))}
            </select>
          ))}

          {field('Location', (
            <input type="text" value={form.location} className={inputCls}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          ))}

          <div className="grid grid-cols-2 gap-4">
            {field('Start Time', (
              <input type="datetime-local" value={form.startTime} className={inputCls}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            ))}
            {field('End Time', (
              <input type="datetime-local" value={form.endTime} className={inputCls}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            ))}
          </div>

          {field('Status', (
            <select value={form.status} className={inputCls}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="planned">Planned</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ))}

          {field('Description', (
            <textarea value={form.description} rows={3} className={`${inputCls} resize-none`}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button type="submit" disabled={mutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
