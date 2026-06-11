import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, MapPin, Clock, Anchor, Sparkles, RefreshCw, Loader2, ChevronDown } from 'lucide-react'
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
  const [isOpen, setIsOpen] = useState(false)
  const ai = trip?.aiSummary
  const isPending  = ai?.status === 'pending'
  const isDone     = ai?.status === 'done'
  const isFailed   = ai?.status === 'failed'
  const showButton = canGenerate && trip?.status === 'completed'
  const content    = isDone ? (ai[lang] || ai.vi || ai.en) : null

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 focus:outline-none hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-500" />
          <h3 className="font-semibold text-foreground text-sm">AI Insights</h3>
        </div>
        <div className="flex items-center gap-3">
           <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{isOpen ? 'Hide' : 'Expand'}</span>
           <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="p-4 pt-0 border-t border-border/50">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 mt-4">
            <div className="text-xs text-muted-foreground hidden sm:block">Summary of dive operations</div>
            <div className="flex items-center gap-3 flex-wrap ml-auto">
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
                    dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/30 shrink-0"
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
      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <button onClick={() => navigate('/trips')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft size={16} /> Back to Trips
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground break-words">{trip.name}</h1>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
              </div>
              {trip.description && <p className="text-muted-foreground text-sm font-normal mt-1">{trip.description}</p>}
            </div>
            {canEdit && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border bg-card shadow-sm rounded-md text-sm font-medium text-muted-foreground hover:bg-muted transition-colors shrink-0">
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* ── Info grid (Unified Card) ── */}
        <div className="bg-card border border-border rounded-lg shadow-sm p-5">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1 flex items-center gap-1.5"><Anchor size={12} /> ROV</span>
              <span className="text-sm font-medium text-foreground">{trip.rov?.name || '—'}</span>
              {trip.rov?.model && <span className="text-xs text-muted-foreground mt-0.5">{trip.rov.model}</span>}
            </div>

            {trip.location && (
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1 flex items-center gap-1.5"><MapPin size={12} /> Location</span>
                <span className="text-sm font-medium text-foreground">{trip.location}</span>
              </div>
            )}

            {trip.startTime && (
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1 flex items-center gap-1.5"><Clock size={12} /> Start Time</span>
                <span className="text-sm font-mono text-foreground">{new Date(trip.startTime).toLocaleDateString()}</span>
              </div>
            )}

            {trip.endTime && (
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1 flex items-center gap-1.5"><Clock size={12} /> End Time</span>
                <span className="text-sm font-mono text-foreground">{new Date(trip.endTime).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Created by</span>
          <span className="text-sm font-medium text-foreground">{trip.createdBy?.fullName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm font-mono text-foreground">{new Date(trip.createdAt).toLocaleDateString()}</span>
        </div>

        <DiveList tripId={trip._id} tripGpsLocation={trip.gpsLocation} />

        <AISummarySection trip={trip} canGenerate={canEdit} onGenerate={() => generateMutation.mutate()} generating={generateMutation.isPending} />
      </div>

      {showForm && <TripForm tripData={trip} onClose={() => setShowForm(false)} />}
    </div>
  )
}
