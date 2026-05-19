import { AlertTriangle, TriangleAlert } from 'lucide-react'

export default function ConfirmDialog({
  title, message, onConfirm, onCancel, loading,
  confirmLabel, variant = 'danger',
}) {
  const isWarning = variant === 'warning'

  const btnCls = isWarning
    ? 'bg-amber-500 hover:bg-amber-600 text-white'
    : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'

  const iconCls = isWarning
    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
    : 'bg-destructive/10 text-destructive'

  const defaultLabel = isWarning ? 'Continue' : 'Delete'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm p-6 border border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconCls}`}>
            <AlertTriangle size={18} />
          </div>
          <h2 className="font-semibold text-foreground">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6 ml-[52px]">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`px-4 py-2 text-sm rounded-lg disabled:opacity-50 transition-colors ${btnCls}`}>
            {loading ? 'Processing...' : (confirmLabel || defaultLabel)}
          </button>
        </div>
      </div>
    </div>
  )
}
