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

export default function RovForm({ rovData, onClose }) {
  const queryClient = useQueryClient()
  const isEdit = !!rovData

  const [form, setForm] = useState({
    name: rovData?.name || '',
    model: rovData?.model || '',
    serialNumber: rovData?.serialNumber || '',
    status: rovData?.status || 'active',
    notes: rovData?.notes || ''
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit ? api.patch(`/rovs/${rovData._id}`, data) : api.post('/rovs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rovs'] })
      toast.success(isEdit ? 'ROV updated' : 'ROV created')
      onClose()
    },
    onError: (err) => setError(err.message || 'Something went wrong')
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{isEdit ? 'Edit ROV' : 'Add ROV'}</h2>
          <MarineButton variant="icon" icon={X} onClick={onClose} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }} className="p-6 space-y-4">
          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

          {[['Name', 'name'], ['Model', 'model'], ['Serial Number', 'serialNumber']].map(([label, key]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
              <MarineInput type="text" required value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <MarineSelect value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </MarineSelect>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <MarineTextarea value={form.notes} rows={3}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <MarineButton variant="outline" type="button" onClick={onClose}>Cancel</MarineButton>
            <MarineButton variant="solid" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create ROV'}
            </MarineButton>
          </div>
        </form>
      </div>
    </div>
  )
}
