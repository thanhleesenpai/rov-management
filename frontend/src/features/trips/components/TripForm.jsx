import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'

import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineButton } from '@/components/bespoke/MarineButton'
import { MarineInput } from '@/components/bespoke/MarineInput'
import { MarineTextarea } from '@/components/bespoke/MarineTextarea'

const inputCls = 'w-full border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground'

export default function TripForm({ projectId, tripData, onClose }) {
  const queryClient = useQueryClient()
  const isEdit = !!tripData

  const [form, setForm] = useState({
    title: tripData?.title || '',
    description: tripData?.description || '',
    status: tripData?.status || 'pending'
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit ? api.patch(`/trips/${tripData._id}`, data) : api.post(`/projects/${projectId}/trips`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.success(isEdit ? 'Trip updated' : 'Trip created')
      onClose()
    },
    onError: (err) => setError(err.message || 'Something went wrong')
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{isEdit ? 'Edit Trip' : 'New Trip'}</h2>
          <MarineButton variant="icon" icon={X} onClick={onClose} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }} className="p-6 space-y-4">
          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title</label>
            <MarineInput type="text" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <MarineSelect value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
            </MarineSelect>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Objectives</label>
            <MarineTextarea value={form.objectives} rows={3}
              onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <MarineTextarea value={form.description} rows={3}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <MarineButton variant="outline" type="button" onClick={onClose}>Cancel</MarineButton>
            <MarineButton variant="solid" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Trip'}
            </MarineButton>
          </div>
        </form>
      </div>
    </div>
  )
}
