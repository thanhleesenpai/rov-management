import { useState, useRef, useEffect } from 'react'
import { Download, FileText, Sheet } from 'lucide-react'

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
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Export"
      >
        <Download size={14} />
        <span className="hidden sm:inline">Export</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
          <button
            onClick={() => { onExportCSV(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Sheet size={14} className="text-green-600" />
            Export CSV
          </button>
          <button
            onClick={() => { onExportPDF(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <FileText size={14} className="text-red-500" />
            Export PDF
          </button>
        </div>
      )}
    </div>
  )
}
