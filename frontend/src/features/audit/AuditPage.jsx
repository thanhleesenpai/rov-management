import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import api from '@/lib/axios'
import { Skeleton } from '@/components/shared/Skeleton'
import Pagination from '@/components/shared/Pagination'
import EmptyState from '@/components/shared/EmptyState'
import Avatar from '@/components/shared/Avatar'
import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineTable, MarineTableHeader, MarineTableBody, MarineTableRow, MarineTableHead, MarineTableCell } from '@/components/bespoke/MarineTable'

const ACTION_STYLE = {
  create:           'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400',
  update:           'bg-blue-500/10 text-blue-600 border border-blue-500/20 dark:text-blue-400',
  delete:           'bg-destructive/10 text-destructive border border-destructive/20',
  change_role:      'bg-purple-500/10 text-purple-600 border border-purple-500/20 dark:text-purple-400',
  activate:         'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400',
  disable:          'bg-destructive/10 text-destructive border border-destructive/20',
  bulk_activate:    'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400',
  bulk_disable:     'bg-destructive/10 text-destructive border border-destructive/20',
  bulk_change_role: 'bg-purple-500/10 text-purple-600 border border-purple-500/20 dark:text-purple-400',
  generate_summary: 'bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400',
}

const ENTITIES = ['', 'ROV', 'Project', 'Trip', 'User']
const LIMIT = 20

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <div className="w-full sm:w-48 shrink-0">
          <MarineSelect value={filterEntity} onChange={e => { setFilterEntity(e.target.value); setPage(1) }}>
            {ENTITIES.map(e => <option key={e} value={e}>{e || 'All Entities'}</option>)}
          </MarineSelect>
        </div>
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
        <EmptyState icon={ShieldCheck} title="No audit logs yet" description="Actions on projects, ROVs, and users will appear here." />
      ) : (
        <>
          {/* Mobile card list */}
          <div className="xl:hidden space-y-2">
            {logs.map(log => (
              <div key={log._id} className="bg-card rounded-lg border border-border shadow-sm p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <Avatar name={log.userId?.fullName} avatarUrl={log.userId?.avatar} size="md" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{log.userId?.fullName || 'Unknown'}</span>
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{timeAgo(log.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-widest font-semibold transition-colors ${ACTION_STYLE[log.action] || 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{log.entity}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs text-muted-foreground">
                      {log.details?.name && <span className="text-foreground">"{log.details.name}"</span>}
                      {log.details?.email && <span className="text-foreground">({log.details.email})</span>}
                      {log.details?.role && <span className="text-foreground">→ {log.details.role}</span>}
                      {log.details?.count && <span className="text-foreground">({log.details.count} items)</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden xl:block">
            <MarineTable>
              <MarineTableHeader>
                <MarineTableRow>
                  <MarineTableHead>User</MarineTableHead>
                  <MarineTableHead>Action</MarineTableHead>
                  <MarineTableHead>Entity</MarineTableHead>
                  <MarineTableHead>Details</MarineTableHead>
                  <MarineTableHead align="right">Time</MarineTableHead>
                </MarineTableRow>
              </MarineTableHeader>
              <MarineTableBody>
                {logs.map(log => (
                  <MarineTableRow key={log._id}>
                    <MarineTableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={log.userId?.fullName} avatarUrl={log.userId?.avatar} size="md" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{log.userId?.fullName || 'Unknown'}</p>
                          <p className="font-mono text-xs text-muted-foreground">{log.userId?.email}</p>
                        </div>
                      </div>
                    </MarineTableCell>
                    <MarineTableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-widest font-semibold transition-colors ${ACTION_STYLE[log.action] || 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </MarineTableCell>
                    <MarineTableCell>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{log.entity}</span>
                    </MarineTableCell>
                    <MarineTableCell isMono>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {log.details?.name && <span className="text-foreground">"{log.details.name}"</span>}
                        {log.details?.email && <span className="text-foreground">({log.details.email})</span>}
                        {log.details?.role && <span className="text-foreground">→ {log.details.role}</span>}
                        {log.details?.count && <span className="text-foreground">({log.details.count} items)</span>}
                      </div>
                    </MarineTableCell>
                    <MarineTableCell align="right">
                      <div className="text-sm font-medium text-foreground">{timeAgo(log.createdAt)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString()}</div>
                    </MarineTableCell>
                  </MarineTableRow>
                ))}
              </MarineTableBody>
            </MarineTable>
          </div>

          <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1}
            total={data?.total ?? 0} limit={LIMIT} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
