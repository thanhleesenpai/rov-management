import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Anchor, MapPin, Radio, Activity, Upload, Pencil, Download, FileText, MoreVertical } from 'lucide-react'
import { MarineTableStatus } from '@/components/bespoke/MarineTable'

function StatusDot({ status }) {
  if (status === 'running') {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.7)]" />
      </span>
    )
  }
  const dot = {
    done:    'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.7)] dark:bg-emerald-400',
    failed:  'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.7)] dark:bg-red-400',
    pending: 'bg-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.7)] dark:bg-amber-300',
  }
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot[status] ?? dot.pending}`} />
}

export function DiveHeader({
  dive,
  sText,
  sCls,
  backTo,
  navigate,
  hasSensor,
  canUpload,
  canEdit,
  setShowSensorUp,
  setShowUpload,
  setShowForm,
  showExport,
  setShowExport,
  exportRef,
  exportCsv,
  exportChartPng,
  chartData
}) {
  const hasGps = dive.gpsLocation?.lat != null && dive.gpsLocation?.lng != null
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const mobileMenuRef = useRef(null)

  useEffect(() => {
    if (!showMobileMenu) return
    const handler = (e) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target))
        setShowMobileMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMobileMenu])

  return (
    <header className="h-11 flex-none flex items-center gap-2 md:gap-3 px-4
                       bg-card border-b border-border shrink-0 z-10">

      <button onClick={() => navigate(backTo)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground
                   hover:bg-muted transition-colors shrink-0">
        <ArrowLeft size={15} />
      </button>

      {/* Mobile: compact dot only */}
      <span className="md:hidden shrink-0">
        <StatusDot status={dive.status} />
      </span>

      {/* md+: dot + label, same MarineTableStatus used in the dives table */}
      <span className="hidden md:inline-flex shrink-0">
        <MarineTableStatus status={dive.status} label={sText} />
      </span>

      <h1 className="font-bold text-foreground text-[15px] truncate flex-1 min-w-0">
        {dive.title}
      </h1>

      {/* Desktop nav meta (trip chip + location) — visible from md+ */}
      <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        {dive.trip && (
          <Link to={`/trips/${dive.trip._id}`}
            title={dive.trip.name}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px]
                       border border-slate-200 dark:border-slate-700
                       bg-slate-50 dark:bg-slate-800
                       text-[11px] font-mono uppercase tracking-wider
                       text-slate-600 dark:text-slate-400
                       hover:border-cyan-300 dark:hover:border-cyan-700
                       hover:text-cyan-700 dark:hover:text-cyan-400
                       transition-colors truncate max-w-[160px]">
            <Anchor size={10} className="shrink-0" />
            Trip: {dive.trip.name}
          </Link>
        )}
        {hasGps && dive.locationName && (
          <span className="hidden lg:flex items-center gap-1.5 max-w-[200px] truncate"
            title={dive.locationName}>
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{dive.locationName}</span>
          </span>
        )}
      </div>

      {/* Desktop action buttons — hidden on mobile */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {hasSensor && (
          <span className="flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full shrink-0
                           text-[10px] font-bold
                           text-emerald-700 bg-emerald-50 border border-emerald-200
                           dark:text-emerald-300 dark:bg-emerald-900/25 dark:border-emerald-800">
            <Radio size={10} className="animate-pulse shrink-0" />
            Synced
          </span>
        )}
        {canUpload && (
          <button onClick={() => setShowSensorUp(true)} title="Upload sensor data"
            className="p-2 rounded-lg text-muted-foreground hover:text-primary
                       hover:bg-muted transition-colors">
            <Activity size={15} />
          </button>
        )}
        {canUpload && (
          <button onClick={() => setShowUpload(true)} title="Upload media"
            className="p-2 rounded-lg text-muted-foreground hover:text-primary
                       hover:bg-muted transition-colors">
            <Upload size={15} />
          </button>
        )}
        {canEdit && (
          <button onClick={() => setShowForm(true)} title="Edit dive"
            className="p-2 rounded-lg text-muted-foreground hover:text-yellow-500
                       hover:bg-muted transition-colors">
            <Pencil size={15} />
          </button>
        )}
        <div className="relative" ref={exportRef}>
          <button onClick={() => setShowExport(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       text-muted-foreground border border-border hover:border-input
                       hover:text-foreground hover:bg-muted transition-colors">
            <Download size={12} /> Export
          </button>
          {showExport && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-card border border-border
                            rounded-xl shadow-lg py-1 z-50">
              <button onClick={() => { exportCsv(); setShowExport(false) }}
                disabled={!chartData.length}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                           hover:bg-muted transition-colors disabled:opacity-40 text-left">
                <FileText size={13} className="text-muted-foreground shrink-0" />
                Sensor CSV
              </button>
              <button onClick={() => { exportChartPng(); setShowExport(false) }}
                disabled={!chartData.length}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                           hover:bg-muted transition-colors disabled:opacity-40 text-left">
                <Download size={13} className="text-muted-foreground shrink-0" />
                Chart PNG
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: trip chip + data-synced badge + ⋮ — always show text, no icon-only */}
      <div className="flex md:hidden items-center gap-1.5 shrink-0">

        {dive.trip && (
          <Link to={`/trips/${dive.trip._id}`}
            title={dive.trip.name}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px]
                       border border-slate-200 dark:border-slate-700
                       bg-slate-50 dark:bg-slate-800
                       text-[11px] font-mono uppercase tracking-wider
                       text-slate-600 dark:text-slate-400
                       hover:border-cyan-300 dark:hover:border-cyan-700
                       hover:text-cyan-700 dark:hover:text-cyan-400
                       transition-colors shrink-0 max-w-[100px]">
            <Anchor size={10} className="shrink-0" />
            <span className="truncate">{dive.trip.name}</span>
          </Link>
        )}

        {hasSensor && (
          <span className="flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full shrink-0
                           text-[10px] font-bold
                           text-emerald-700 bg-emerald-50 border border-emerald-200
                           dark:text-emerald-300 dark:bg-emerald-900/25 dark:border-emerald-800">
            <Radio size={10} className="animate-pulse shrink-0" />
            Synced
          </span>
        )}

        {/* ⋮ dropdown */}
        <div className="relative" ref={mobileMenuRef}>
        <button onClick={() => setShowMobileMenu(v => !v)}
          className={`p-2 rounded-lg transition-colors
                     ${showMobileMenu
                       ? 'bg-muted text-foreground'
                       : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
          <MoreVertical size={15} />
        </button>
        {showMobileMenu && (
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-card border border-border
                          rounded-xl shadow-lg py-1 z-50">
            {canUpload && (
              <button onClick={() => { setShowSensorUp(true); setShowMobileMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                           hover:bg-muted transition-colors text-left">
                <Activity size={13} className="text-muted-foreground shrink-0" />
                Upload Sensor
              </button>
            )}
            {canUpload && (
              <button onClick={() => { setShowUpload(true); setShowMobileMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                           hover:bg-muted transition-colors text-left">
                <Upload size={13} className="text-muted-foreground shrink-0" />
                Upload Media
              </button>
            )}
            {canEdit && (
              <button onClick={() => { setShowForm(true); setShowMobileMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                           hover:bg-muted transition-colors text-left">
                <Pencil size={13} className="text-muted-foreground shrink-0" />
                Edit Dive
              </button>
            )}
            <div className="border-t border-border mx-3 my-1" />
            <button onClick={() => { exportCsv(); setShowMobileMenu(false) }}
              disabled={!chartData.length}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                         hover:bg-muted transition-colors text-left disabled:opacity-40">
              <FileText size={13} className="text-muted-foreground shrink-0" />
              Export Sensor CSV
            </button>
            <button onClick={() => { exportChartPng(); setShowMobileMenu(false) }}
              disabled={!chartData.length}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground
                         hover:bg-muted transition-colors text-left disabled:opacity-40">
              <Download size={13} className="text-muted-foreground shrink-0" />
              Export Chart PNG
            </button>
          </div>
        )}
        </div>{/* end mobileMenuRef */}

      </div>{/* end mobile flex row */}
    </header>
  )
}
