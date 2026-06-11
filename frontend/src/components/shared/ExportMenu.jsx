import { useState, useRef, useEffect } from 'react'
import { Download, FileText, Sheet } from 'lucide-react'

import { MarineButton } from '@/components/bespoke/MarineButton'

export default function ExportMenu({ onExportCSV, onExportPDF, loading }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <MarineButton
        variant="outline"
        icon={Download}
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        title="Export"
        className="max-sm:w-9 max-sm:px-0"
      >
        <span className="hidden sm:inline">Export</span>
      </MarineButton>

      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-card rounded-xl shadow-lg border border-border z-20 overflow-hidden">
          <button
            onClick={() => { onExportCSV(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <Sheet size={14} className="text-green-500" />
            Export CSV
          </button>
          <button
            onClick={() => { onExportPDF(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <FileText size={14} className="text-destructive" />
            Export PDF
          </button>
        </div>
      )}
    </div>
  )
}
