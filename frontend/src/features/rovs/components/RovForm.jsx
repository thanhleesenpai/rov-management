import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'

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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }} className="p-6 space-y-4">
          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

          {[['Name', 'name'], ['Model', 'model'], ['Serial Number', 'serialNumber']].map(([label, key]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
              <input type="text" required value={form[key]} className={inputCls}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <select value={form.status} className={inputCls}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea value={form.notes} rows={3} className={`${inputCls} resize-none`}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button type="submit" disabled={mutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create ROV'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
