import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { ShieldCheck, User, ToggleLeft, ToggleRight, PenLine, X, Search, CheckSquare, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { TableSkeleton } from '@/components/shared/Skeleton'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import Avatar from '@/components/shared/Avatar'
import { exportUsersCSV, exportUsersPDF } from '@/lib/export'
import EmptyState from '@/components/shared/EmptyState'
import { useDebounce } from '@/hooks/useDebounce'

import { MarineInput } from '@/components/bespoke/MarineInput'
import { MarineSelect } from '@/components/bespoke/MarineSelect'
import { MarineButton } from '@/components/bespoke/MarineButton'
import {
  MarineTable, MarineTableHeader, MarineTableBody,
  MarineTableRow, MarineTableHead, MarineTableCell, MarineTableStatus,
  MarineTableActionMenu, MarineTableActionItem
} from '@/components/bespoke/MarineTable'

const ROLE_STYLE = {
  admin:    'bg-purple-500/10 text-purple-600 border border-purple-500/20 dark:text-purple-400',
  operator: 'bg-primary/10 text-primary border border-primary/20',
  viewer:   'bg-slate-500/10 text-slate-600 border border-slate-500/20 dark:text-slate-400'
}

const ROLES = ['viewer', 'operator', 'admin']
const LIMIT = 10

function UserEditForm({ user, onClose, onSave, isSelf, saving }) {
  const [form, setForm] = useState({ fullName: user.fullName, role: user.role })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Edit User</h2>
          <MarineButton variant="icon" icon={X} onClick={onClose} />
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">{user.email}</p>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Full Name</label>
            <MarineInput type="text" required value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
          </div>
          {isSelf ? (
            <div className="bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 rounded-lg px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
              You cannot change your own role.
            </div>
          ) : (
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Role</label>
              <MarineSelect value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </MarineSelect>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <MarineButton variant="outline" onClick={onClose} disabled={saving}>Cancel</MarineButton>
            <MarineButton variant="solid" onClick={() => onSave(user._id, form)} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </MarineButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText, isDanger }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <MarineButton variant="icon" icon={X} onClick={onClose} />
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        </div>
        <div className="px-6 py-4 bg-muted/30 border-t border-border flex justify-end gap-2">
          <MarineButton variant="outline" onClick={onClose}>Cancel</MarineButton>
          <MarineButton variant={isDanger ? 'danger' : 'solid'} onClick={() => { onConfirm(); onClose() }}>
            {confirmText}
          </MarineButton>
        </div>
      </div>
    </div>
  )
}

function UserToggle({ isActive, onClick }) {
  return (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-2 focus:outline-none group"
    >
      <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring/50 ${isActive ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}>
        <span className="sr-only">Toggle status</span>
        <span className={`pointer-events-none absolute left-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className={`text-xs font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
        {isActive ? 'Active' : 'Disabled'}
      </span>
    </button>
  )
}

function RoleDropdown({ onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <MarineButton variant="outline" onClick={() => setOpen(v => !v)} disabled={disabled}>
        <ShieldCheck size={14} className="mr-1" /> Set Role <ChevronDown size={14} className="ml-1" />
      </MarineButton>
      {open && (
        <div className="absolute right-0 sm:left-0 sm:right-auto mt-1 w-36 bg-card rounded-md shadow-lg border border-border z-20 overflow-hidden">
          {ROLES.map(r => (
            <button key={r} onClick={() => { onSelect(r); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted capitalize transition-colors">
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editingUser, setEditingUser] = useState(null)
  const [toggleConfirm, setToggleConfirm] = useState(null)
  const [bulkConfirm, setBulkConfirm] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search: debouncedSearch, role: roleFilter }],
    queryFn: () => api.get('/users', {
      params: { page, limit: LIMIT, search: debouncedSearch || undefined, role: roleFilter || undefined }
    }).then(r => r.data),
    keepPreviousData: true
  })

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/users/${id}/status`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User status updated') },
    onError: (err) => toast.error(err.message || 'Failed to update status')
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/users/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); setEditingUser(null) },
    onError: (err) => toast.error(err.message || 'Failed to update user')
  })

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, isActive }) => api.patch('/users/bulk/status', { ids, isActive }),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success(res?.message || 'Users updated'); exitSelectMode() },
    onError: () => toast.error('Failed to update users')
  })

  const bulkRoleMutation = useMutation({
    mutationFn: ({ ids, role }) => api.patch('/users/bulk/role', { ids, role }),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success(res?.message || 'Users updated'); exitSelectMode() },
    onError: () => toast.error('Failed to update users')
  })

  const users = data?.users || []
  const allSelected = users.length > 0 && users.every(u => selected.has(u._id))
  const someSelected = selected.size > 0

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(users.map(u => u._id)))
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

  const fetchAllUsers = () => api.get('/users', { params: { limit: 1000, search: debouncedSearch || undefined, role: roleFilter || undefined } })
  const handleExportCSV = async () => { const res = await fetchAllUsers(); exportUsersCSV(res?.data?.users || []) }
  const handleExportPDF = async () => { const res = await fetchAllUsers(); exportUsersPDF(res?.data?.users || []) }

  const selectedIds = [...selected]
  const isBulkPending = bulkStatusMutation.isPending || bulkRoleMutation.isPending

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{data?.total ?? 0} users</span>
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
        </div>
      </div>

      {!selectMode ? (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 min-w-48 mx-0 md:mx-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <MarineInput placeholder="Search name or email..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 pr-3 w-full" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="w-full sm:w-32 shrink-0">
              <MarineSelect value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}>
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </MarineSelect>
            </div>
            <MarineButton variant="outline" onClick={() => setSelectMode(true)} icon={CheckSquare} className="w-full sm:w-auto">
              Select
            </MarineButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-4 py-3 bg-muted/40 border border-border rounded-lg shadow-sm">
          <span className="text-sm font-semibold text-primary">
            {someSelected ? `${selected.size} selected` : 'Select users'}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {someSelected && (
              <>
                <MarineButton variant="solid" onClick={() => bulkStatusMutation.mutate({ ids: selectedIds, isActive: true })} disabled={isBulkPending}>
                  Activate
                </MarineButton>
                <MarineButton variant="danger" onClick={() => setBulkConfirm({ type: 'disable' })} disabled={isBulkPending}>
                  Disable
                </MarineButton>
                <RoleDropdown disabled={isBulkPending} onSelect={(role) => setBulkConfirm({ type: 'role', payload: role })} />
              </>
            )}
            <MarineButton variant="outline" onClick={exitSelectMode}>
              Cancel
            </MarineButton>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={User} title="No users found" description="Try adjusting your search or filter." />
      ) : (
        <>
          <div className="hidden xl:block">
            <MarineTable>
              <MarineTableHeader>
                <MarineTableRow>
                  {selectMode && (
                    <MarineTableHead className="w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-primary cursor-pointer" />
                    </MarineTableHead>
                  )}
                  <MarineTableHead>User</MarineTableHead>
                  <MarineTableHead>Role</MarineTableHead>
                  <MarineTableHead>Status</MarineTableHead>
                  <MarineTableHead>Last Login</MarineTableHead>
                  {!selectMode && <MarineTableHead align="right">Actions</MarineTableHead>}
                </MarineTableRow>
              </MarineTableHeader>
              <MarineTableBody>
                {users.map(u => (
                  <MarineTableRow key={u._id}
                    className={`${selectMode ? 'cursor-pointer' : ''} ${selected.has(u._id) ? 'bg-primary/5' : ''}`}
                    onClick={selectMode ? () => toggleSelect(u._id) : undefined}>
                    {selectMode && (
                      <MarineTableCell>
                        <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggleSelect(u._id)}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-primary cursor-pointer" />
                      </MarineTableCell>
                    )}
                    <MarineTableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={u.fullName} avatarUrl={u.avatar} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{u.fullName}</p>
                          <p className="font-mono text-xs text-muted-foreground truncate" title={u.email}>{u.email}</p>
                        </div>
                      </div>
                    </MarineTableCell>
                    <MarineTableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-widest font-semibold transition-colors ${ROLE_STYLE[u.role] || 'border-slate-200 text-slate-600 bg-slate-50'}`}>
                        {u.role}
                      </span>
                    </MarineTableCell>
                    <MarineTableCell>
                      <UserToggle 
                        isActive={u.isActive} 
                        onClick={() => setToggleConfirm({ user: u, newState: !u.isActive })} 
                      />
                    </MarineTableCell>
                    <MarineTableCell isMono>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : <span className="text-slate-400">—</span>}
                    </MarineTableCell>
                    {!selectMode && (
                      <MarineTableCell align="right">
                        <div className="flex items-center justify-end gap-3">
                          <MarineTableActionMenu>
                            <MarineTableActionItem onClick={() => setEditingUser(u)}>
                              <PenLine size={14} /> Edit
                            </MarineTableActionItem>
                          </MarineTableActionMenu>
                        </div>
                      </MarineTableCell>
                    )}
                  </MarineTableRow>
                ))}
              </MarineTableBody>
            </MarineTable>
          </div>

          <div className="xl:hidden space-y-2">
            {users.map(u => (
              <div key={u._id}
                className={`bg-card rounded-lg border shadow-sm p-4 transition-colors group ${selectMode ? 'cursor-pointer' : ''} ${selected.has(u._id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                onClick={selectMode ? () => toggleSelect(u._id) : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {selectMode ? (
                      <div className="pt-1">
                        <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggleSelect(u._id)}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0" />
                      </div>
                    ) : (
                      <div className="pt-0.5 shrink-0">
                        <Avatar name={u.fullName} avatarUrl={u.avatar} size="md" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <p className="text-sm font-medium text-foreground truncate">{u.fullName}</p>
                        <p className="font-mono text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-widest font-semibold transition-colors ${ROLE_STYLE[u.role] || 'border-slate-200 text-slate-600 bg-slate-50'}`}>
                          {u.role}
                        </span>
                        <UserToggle 
                          isActive={u.isActive} 
                          onClick={() => setToggleConfirm({ user: u, newState: !u.isActive })} 
                        />
                      </div>
                    </div>
                  </div>
                  
                  {!selectMode && (
                    <div className="flex items-center gap-2 shrink-0 pl-2 mt-1">
                      <div onClick={e => e.stopPropagation()}>
                        <MarineTableActionMenu>
                          <MarineTableActionItem onClick={() => setEditingUser(u)}>
                            <PenLine size={14} /> Edit
                          </MarineTableActionItem>
                        </MarineTableActionMenu>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Pagination page={data.page} totalPages={data.totalPages}
            total={data.total} limit={LIMIT} onPageChange={setPage} />
        </>
      )}

      {editingUser && (
        <UserEditForm user={editingUser} onClose={() => setEditingUser(null)}
          onSave={(id, data) => editMutation.mutate({ id, data })}
          isSelf={currentUser?._id === editingUser._id} saving={editMutation.isPending} />
      )}

      <ConfirmModal 
        isOpen={!!toggleConfirm}
        onClose={() => setToggleConfirm(null)}
        onConfirm={() => {
          if (toggleConfirm) toggleMutation.mutate(toggleConfirm.user._id)
        }}
        title={toggleConfirm?.newState ? 'Activate User' : 'Disable User'}
        message={toggleConfirm?.newState 
          ? `Are you sure you want to grant access to ${toggleConfirm?.user?.fullName}?` 
          : `Are you sure you want to disable access for ${toggleConfirm?.user?.fullName}? They will no longer be able to log in.`}
        confirmText={toggleConfirm?.newState ? 'Activate' : 'Disable'}
        isDanger={!toggleConfirm?.newState}
      />

      <ConfirmModal 
        isOpen={!!bulkConfirm}
        onClose={() => setBulkConfirm(null)}
        onConfirm={() => {
          if (!bulkConfirm) return
          if (bulkConfirm.type === 'disable') {
            bulkStatusMutation.mutate({ ids: selectedIds, isActive: false })
          } else if (bulkConfirm.type === 'role') {
            bulkRoleMutation.mutate({ ids: selectedIds, role: bulkConfirm.payload })
          }
        }}
        title={bulkConfirm?.type === 'disable' ? 'Disable Users' : 'Change Role'}
        message={bulkConfirm?.type === 'disable' 
          ? `Are you sure you want to disable ${selected.size} selected users? They will be logged out and cannot access the system.`
          : `Are you sure you want to change the role of ${selected.size} selected users to ${bulkConfirm?.payload}?`}
        confirmText={bulkConfirm?.type === 'disable' ? 'Disable' : 'Change Role'}
        isDanger={bulkConfirm?.type === 'disable'}
      />
    </div>
  )
}
