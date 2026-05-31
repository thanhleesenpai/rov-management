import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { ShieldCheck, User, ToggleLeft, ToggleRight, Pencil, X, Search, CheckSquare, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { TableSkeleton } from '@/components/shared/Skeleton'
import Pagination from '@/components/shared/Pagination'
import ExportMenu from '@/components/shared/ExportMenu'
import { exportUsersCSV, exportUsersPDF } from '@/lib/export'
import EmptyState from '@/components/shared/EmptyState'
import { useDebounce } from '@/hooks/useDebounce'

const ROLE_STYLE = {
  admin:    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  operator: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  viewer:   'bg-muted text-muted-foreground'
}

const ROLES = ['viewer', 'operator', 'admin']
const LIMIT = 10

function UserEditForm({ user, onClose, onSave, isSelf, saving }) {
  const [form, setForm] = useState({ fullName: user.fullName, role: user.role })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Edit User</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">{user.email}</p>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
            <input type="text" required value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              className="w-full border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {isSelf ? (
            <div className="bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 rounded-lg px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
              You cannot change your own role.
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">Cancel</button>
            <button onClick={() => onSave(user._id, form)} disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
      <button onClick={() => setOpen(v => !v)} disabled={disabled}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50 font-medium">
        <ShieldCheck size={12} /> Set Role <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-36 bg-card rounded-xl shadow-lg border border-border z-20 overflow-hidden">
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
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const debouncedSearch = useDebounce(search)

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
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search name or email..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-input bg-background text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
          </div>
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
            className="border border-input bg-background text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
          <button onClick={() => setSelectMode(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
            <CheckSquare size={14} /> Select
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4 p-3 bg-primary/5 rounded-xl border border-primary/20">
          <span className="text-sm font-medium text-primary">
            {someSelected ? `${selected.size} selected` : 'Select users'}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {someSelected && (
              <>
                <button onClick={() => bulkStatusMutation.mutate({ ids: selectedIds, isActive: true })} disabled={isBulkPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors disabled:opacity-50 font-medium">
                  <ToggleRight size={13} /> Activate
                </button>
                <button onClick={() => bulkStatusMutation.mutate({ ids: selectedIds, isActive: false })} disabled={isBulkPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 font-medium">
                  <ToggleLeft size={13} /> Deactivate
                </button>
                <RoleDropdown disabled={isBulkPending} onSelect={(role) => bulkRoleMutation.mutate({ ids: selectedIds, role })} />
              </>
            )}
            <button onClick={exitSelectMode}
              className="px-3 py-1.5 text-xs text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors font-medium">
              Cancel
            </button>
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
          {/* Desktop table */}
          <div className="hidden xl:block bg-card rounded-xl shadow overflow-hidden border border-border">
            <table className="w-full text-sm min-w-max">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {selectMode && (
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
                    </th>
                  )}
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">User</th>
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">Role</th>
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-6 py-3 text-muted-foreground font-medium">Last Login</th>
                  {!selectMode && <th className="sticky right-0 bg-muted text-right px-6 py-3 text-muted-foreground font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => (
                  <tr key={u._id}
                    className={`transition-colors ${selectMode ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-muted/50'} ${selected.has(u._id) ? 'bg-primary/5' : ''}`}
                    onClick={selectMode ? () => toggleSelect(u._id) : undefined}>
                    {selectMode && (
                      <td className="px-4 py-4">
                        <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggleSelect(u._id)}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-6 py-4 min-w-[200px]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User size={14} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{u.fullName}</p>
                          <p className="text-xs text-muted-foreground truncate" title={u.email}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1 w-fit px-2 py-1 rounded-full text-xs font-medium ${ROLE_STYLE[u.role]}`}>
                        <ShieldCheck size={11} /> {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'}`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap" title={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : ''}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                    </td>
                    {!selectMode && (
                      <td className="sticky right-0 bg-card px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditingUser(u)} className="p-1.5 text-muted-foreground hover:text-yellow-500 rounded transition-colors" title="Edit">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => toggleMutation.mutate(u._id)} disabled={toggleMutation.isPending}
                            title={u.isActive ? 'Disable' : 'Enable'}
                            className={`p-1.5 rounded transition-colors ${u.isActive ? 'text-green-500 hover:text-destructive' : 'text-muted-foreground hover:text-green-500'}`}>
                            {u.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="xl:hidden space-y-2">
            {users.map(u => (
              <div key={u._id}
                className={`bg-card rounded-xl border shadow-sm px-4 py-3 transition-colors ${selectMode ? 'cursor-pointer' : ''} ${selected.has(u._id) ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={selectMode ? () => toggleSelect(u._id) : undefined}>
                <div className="flex items-center justify-between gap-2">
                  {selectMode && (
                    <input type="checkbox" checked={selected.has(u._id)} onChange={() => toggleSelect(u._id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0" />
                  )}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User size={15} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{u.fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLE[u.role]}`}>{u.role}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'}`}>
                      {u.isActive ? 'Active' : 'Off'}
                    </span>
                    {!selectMode && (
                      <>
                        <button onClick={() => setEditingUser(u)} className="p-1.5 text-muted-foreground hover:text-yellow-500 rounded transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleMutation.mutate(u._id)} disabled={toggleMutation.isPending}
                          className={`p-1.5 rounded transition-colors ${u.isActive ? 'text-green-500 hover:text-destructive' : 'text-muted-foreground hover:text-green-500'}`}>
                          {u.isActive ? <ToggleRight size={19} /> : <ToggleLeft size={19} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination page={data.page} totalPages={data.totalPages}
            total={data.total} limit={LIMIT} onPageChange={setPage} />
        </>
      )}

      {editingUser && (
        <UserEditForm user={editingUser} isSelf={editingUser._id === currentUser?._id}
          saving={editMutation.isPending}
          onClose={() => setEditingUser(null)}
          onSave={(id, formData) => editMutation.mutate({ id, data: formData })} />
      )}
    </div>
  )
}
