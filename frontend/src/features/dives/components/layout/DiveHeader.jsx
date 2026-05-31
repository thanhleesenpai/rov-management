import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Anchor, MapPin, Radio, Activity, Upload, Pencil, Download, FileText } from 'lucide-react'

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

  return (
    <header className="h-11 flex-none flex items-center gap-3 px-4
                       bg-card border-b border-border shadow-sm shrink-0 z-10">

      <button onClick={() => navigate(backTo)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground
                   hover:bg-muted transition-colors shrink-0">
        <ArrowLeft size={15} />
      </button>

      <span className={`px-2.5 py-1 rounded text-xs font-semibold shrink-0 ${sCls}`}>
        {sText}
      </span>

      <h1 className="font-bold text-foreground text-[15px] truncate flex-1 min-w-0">
        {dive.title}
      </h1>

      <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
        {dive.trip && (
          <Link to={`/trips/${dive.trip._id}`}
            className="flex items-center gap-1.5 hover:text-primary transition-colors">
            <Anchor size={11} /> {dive.trip.name}
          </Link>
        )}
        {hasGps && dive.locationName && (
          <span className="flex items-center gap-1.5 max-w-[200px] truncate"
            title={dive.locationName}>
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{dive.locationName}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasSensor && (
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold
                           text-emerald-600 dark:text-emerald-400
                           bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-2.5 py-1.5">
            <Radio size={11} className="animate-pulse shrink-0" />
            DATA SYNCED
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
    </header>
  )
}
