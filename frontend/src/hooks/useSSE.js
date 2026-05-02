import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'

const TOAST_TYPES = {
  job_failed:       (n) => toast.error(n.title, { description: n.body }),
  account_disabled: (n) => toast.error(n.title, { description: n.body }),
}

export function useSSE() {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore(s => s.accessToken)

  useEffect(() => {
    if (!accessToken) return

    // EventSource không hỗ trợ Authorization header — truyền token qua query param
    const url = `/api/v1/notifications/stream?token=${accessToken}`
    const es = new EventSource(url)

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'notification') {
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          // Toast cho các loại khẩn cấp
          TOAST_TYPES[msg.data?.type]?.(msg.data)
        }
      } catch { /* ignore malformed */ }
    }

    es.onerror = () => {
      // EventSource tự reconnect — không cần xử lý thêm
    }

    return () => es.close()
  }, [accessToken, queryClient])
}
