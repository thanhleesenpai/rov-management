import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, MapPin, Clock, Anchor, Sparkles, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/auth.store'
import TripForm from './components/TripForm'
import DiveList from '@/features/dives/DiveList'

function useLangPref() {
  const key = 'rov-ai-lang'
  const [lang, setLangState] = useState(() => localStorage.getItem(key) || 'vi')
  const setLang = (l) => { localStorage.setItem(key, l); setLangState(l) }
  return [lang, setLang]
}

const STATUS = {
  planned:   { text: 'Planned',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ongoing:   { text: 'Ongoing',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  completed: { text: 'Completed', cls: 'bg-muted text-muted-foreground' },
  cancelled: { text: 'Cancelled', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' }
}

function AISummarySection({ trip, canGenerate, onGenerate, generating }) {
  const [lang, setLang] = useLangPref()
  const ai = trip?.aiSummary
  const isPending  = ai?.status === 'pending'
  const isDone     = ai?.status === 'done'
  const isFailed   = ai?.status === 'failed'
  const showButton = canGenerate && trip?.status === 'completed'
  const content    = isDone ? (ai[lang] || ai.vi || ai.en) : null

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-500" />
          <h3 className="font-semibold text-foreground text-sm">AI Summary</h3>
        </div>

        <div className="flex items-center gap-3">
          {isDone && (
            <div className="flex items-center gap-0.5 select-none bg-muted rounded-lg p-0.5 border border-border">
              {['vi', 'en'].map((l, i) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`relative px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                    lang === l
                      ? 'bg-card text-primary shadow-sm scale-105 font-semibold'
                      : 'text-muted-foreground opacity-50 hover:opacity-80 scale-95'
                  }`}
                >
                  {l === 'vi' ? 'VN' : 'EN'}
                </button>
              ))}
            </div>
          )}

          {showButton && (
            <button
              onClick={onGenerate}
              disabled={generating || isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50
                bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100
                dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/30"
            >
              {(generating || isPending)
                ? <><Loader2 size={12} className="animate-spin" /> Generating...</>
                : isDone
                  ? <><RefreshCw size={12} /> Regenerate</>
                  : <><Sparkles size={12} /> Generate Summary</>
              }
            </button>
          )}
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300 rounded-lg px-4 py-3">
          <Loader2 size={14} className="animate-spin shrink-0" />
          AI is generating the summary, please wait...
        </div>
      )}

      {isFailed && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
          Failed to generate summary. {showButton && 'Try again.'}
        </div>
      )}

      {isDone && content && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-800">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{content}</p>
          <p className="text-xs text-muted-foreground mt-3">
            Generated {new Date(ai.generatedAt).toLocaleString()}
          </p>
        </div>
      )}

      {!isPending && !isDone && !isFailed && (
        <p className="text-sm text-muted-foreground">
          {trip?.status === 'completed'
            ? canGenerate ? 'Click "Generate Summary" to create an AI summary.' : 'No summary generated yet.'
            : 'Summary available after trip is completed.'}
        </p>
      )}
    </div>
  )
}

export default function TripDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const queryClient = useQueryClient()

  const { data: trip, isLoading, isError } = useQuery({
    queryKey: ['trips', id],
    queryFn: () => api.get(`/trips/${id}`).then(r => r.data),
    refetchInterval: (query) => {
      const status = query.state?.data?.aiSummary?.status
      return status === 'pending' ? 3000 : 30000
    },
  })

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/trips/${id}/ai-summary`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips', id] })
      toast.success('Generating summary...')
    },
    onError: (err) => toast.error(err?.message || 'Failed to start generation'),
  })

  const canEdit = ['admin', 'operator'].includes(user?.role)

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>
  if (isError || !trip) throw new Error('Trip not found')

  const { text, cls } = STATUS[trip.status] || STATUS.planned

  return (
    <div>
      <button onClick={() => navigate('/trips')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to Trips
      </button>

      <div className="bg-card rounded-xl shadow border border-border p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{trip.name}</h1>
            {trip.description && <p className="text-muted-foreground text-sm mt-1">{trip.description}</p>}
          </div>
          {canEdit && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="bg-muted rounded-lg p-4 flex gap-3">
            <Anchor size={16} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">ROV</p>
              <p className="font-medium text-foreground">{trip.rov?.name || '—'}</p>
              <p className="text-xs text-muted-foreground">{trip.rov?.model}</p>
            </div>
          </div>

          {trip.location && (
            <div className="bg-muted rounded-lg p-4 flex gap-3">
              <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Location</p>
                <p className="font-medium text-foreground">{trip.location}</p>
              </div>
            </div>
          )}

          {trip.startTime && (
            <div className="bg-muted rounded-lg p-4 flex gap-3">
              <Clock size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Start Time</p>
                <p className="font-medium text-foreground">{new Date(trip.startTime).toLocaleString()}</p>
              </div>
            </div>
          )}

          {trip.endTime && (
            <div className="bg-muted rounded-lg p-4 flex gap-3">
              <Clock size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">End Time</p>
                <p className="font-medium text-foreground">{new Date(trip.endTime).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
          Created by {trip.createdBy?.fullName} · {new Date(trip.createdAt).toLocaleDateString()}
        </div>

        <DiveList tripId={trip._id} tripGpsLocation={trip.gpsLocation} />

        <AISummarySection trip={trip} canGenerate={canEdit} onGenerate={() => generateMutation.mutate()} generating={generateMutation.isPending} />
      </div>

      {showForm && <TripForm tripData={trip} onClose={() => setShowForm(false)} />}
    </div>
  )
}
