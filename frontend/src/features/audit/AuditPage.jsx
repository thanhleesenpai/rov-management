import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import api from '@/lib/axios'
import { Skeleton } from '@/components/shared/Skeleton'
import Pagination from '@/components/shared/Pagination'
import EmptyState from '@/components/shared/EmptyState'

const ACTION_STYLE = {
  create:           'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  update:           'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  delete:           'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  change_role:      'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  activate:         'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  disable:          'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  bulk_activate:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  bulk_disable:     'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  bulk_change_role: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  generate_summary: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

const ENTITIES = ['', 'ROV', 'Trip', 'Dive', 'User']
const LIMIT = 20

function UserAvatar({ user }) {
  const [broken, setBroken] = useState(false)
  const initials = user?.fullName?.[0]?.toUpperCase() || '?'
  if (user?.avatar && !broken) {
    return (
      <img src={user.avatar} alt="" onError={() => setBroken(true)}
        className="w-8 h-8 rounded-full object-cover" />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center
                    text-primary-foreground text-xs font-bold select-none">
      {initials}
    </div>
  )
}

const timeAgo = (date) => {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return new Date(date).toLocaleDateString()
}

export default function AuditPage() {
  const [page, setPage] = useState(1)
  const [filterEntity, setFilterEntity] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit', { page, filterEntity }],
    queryFn: () => api.get('/audit', {
      params: { page, limit: LIMIT, entity: filterEntity || undefined }
    }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 15000,
    staleTime: 0,
  })

  const logs = data?.data || []
  const isEmpty = !isLoading && !isError && logs.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <select value={filterEntity} onChange={e => { setFilterEntity(e.target.value); setPage(1) }}
          className="border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          {ENTITIES.map(e => <option key={e} value={e}>{e || 'All Entities'}</option>)}
        </select>
      </div>

      {isError ? (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl border border-destructive/20">
          Failed to load audit logs. Please try again.
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : isEmpty ? (
        <EmptyState icon={ShieldCheck} title="No audit logs yet" description="Actions on trips, ROVs, and users will appear here." />
      ) : (
        <>
          <div className="bg-card rounded-xl shadow border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {logs.map(log => (
                <div key={log._id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/50 transition-colors">
                  <div className="shrink-0 mt-0.5">
                    <UserAvatar user={log.userId} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{log.userId?.fullName || 'Unknown'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLE[log.action] || 'bg-muted text-muted-foreground'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-muted-foreground">{log.entity}</span>
                      {log.details?.name && <span className="text-sm text-foreground font-medium truncate">"{log.details.name}"</span>}
                      {log.details?.email && <span className="text-sm text-muted-foreground truncate">({log.details.email})</span>}
                      {log.details?.role && <span className="text-xs text-muted-foreground">→ {log.details.role}</span>}
                      {log.details?.count && <span className="text-xs text-muted-foreground">({log.details.count} users)</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{log.userId?.email} · {timeAgo(log.createdAt)}</p>
                  </div>

                  <span className="text-xs text-muted-foreground/60 shrink-0 mt-1">{new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>

          <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1}
            total={data?.total ?? 0} limit={LIMIT} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
