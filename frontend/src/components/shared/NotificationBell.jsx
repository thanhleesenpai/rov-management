import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'

const timeAgo = (date) => {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}
import api from '@/lib/axios'

const TYPE_ICON = {
  job_done:         '✅',
  job_failed:       '❌',
  trip_completed:   '🏁',
  account_disabled: '🔒',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Đóng khi click ngoài
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications', { params: { limit: 15 } }).then(r => r.data),
    refetchInterval: 60000, // fallback poll 1 phút nếu SSE miss
    staleTime: 0,
  })

  const notifications = data?.notifications || []
  const unreadCount = data?.unreadCount || 0

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const handleClick = (notif) => {
    if (!notif.isRead) markReadMutation.mutate(notif._id)
    setOpen(false)
    if (notif.link) navigate(notif.link)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center transition-colors"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No notifications</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n._id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 items-start ${!n.isRead ? 'bg-blue-50/50' : ''}`}
                >
                  <span className="text-base mt-0.5 shrink-0">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-xs text-gray-400 mt-0.5 truncate">{n.body}</p>}
                    <p className="text-xs text-gray-300 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
