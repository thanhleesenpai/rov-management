import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil } from 'lucide-react'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import RovForm from './components/RovForm'

const STATUS_LABEL = {
  active: { text: 'Active', cls: 'bg-green-100 text-green-700' },
  maintenance: { text: 'Maintenance', cls: 'bg-yellow-100 text-yellow-700' },
  retired: { text: 'Retired', cls: 'bg-gray-200 text-gray-600' }
}

export default function RovDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)

  const { data: rov, isLoading, isError } = useQuery({
    queryKey: ['rovs', id],
    queryFn: () => api.get(`/rovs/${id}`).then(r => r.data)
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)

  if (isLoading) return <div className="p-6 text-gray-500">Loading...</div>
  if (isError || !rov) return <div className="p-6 text-red-500">ROV not found.</div>

  const { text, cls } = STATUS_LABEL[rov.status] || STATUS_LABEL.active

  return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={() => navigate('/rovs')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft size={16} /> Back to ROVs
      </button>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{rov.name}</h1>
            <p className="text-gray-500 text-sm mt-1">{rov.model}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${cls}`}>{text}</span>
            {canEdit && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-400 text-xs mb-1">Serial Number</p>
            <p className="font-mono font-medium text-gray-800">{rov.serialNumber}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-400 text-xs mb-1">Created</p>
            <p className="text-gray-800">{new Date(rov.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {rov.notes && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{rov.notes}</p>
          </div>
        )}

        {rov.specs && Object.keys(rov.specs).length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">Specs</p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
              {Object.entries(rov.specs).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-500 capitalize">{k}:</span>
                  <span className="text-gray-800">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <RovForm rovData={rov} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}
