import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Route } from 'lucide-react'
import api from '@/lib/axios'
import TripMap from '@/features/trips/components/TripMap'

// ── Coordinate transform: DVL local frame → WGS-84 ───────────────────────────
const EARTH_R = 6371000

function dvlToLatLng(anchor, pt) {
  const lat = anchor.lat + (pt.y / EARTH_R) * (180 / Math.PI)
  const lng = anchor.lng + (pt.x / EARTH_R) * (180 / Math.PI) / Math.cos(anchor.lat * Math.PI / 180)
  return [lat, lng]
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t }

// Removed pathColor because we switched to a single solid-color polyline for extreme performance

function niceStep(range) {
  if (range <= 0) return 1
  const raw = range / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  return (norm < 2 ? 1 : norm < 5 ? 2 : 5) * mag
}

// ── Relative-path SVG with zoom/pan ──────────────────────────────────────────
// allData:     full DVL data — stable scale/grid
// visibleData: animated prefix (= allData when not animating)
// isAnimating: video is driving the cursor
function RelativePath({ allData, visibleData, isAnimating }) {
  const W = 280, H = 280, PAD = 14
  const svgRef   = useRef(null)
  const vbRef    = useRef({ x: 0, y: 0, w: W, h: H })
  const dragRef  = useRef(null)
  const touchRef = useRef(null)
  const [vb, setVbState] = useState({ x: 0, y: 0, w: W, h: H })
  const [followMode, setFollowMode] = useState(false)

  const setVb = (v) => { vbRef.current = v; setVbState(v) }
  const hasData = allData.length > 0

  // ── Scale factors (memoised so effects can use toSvg) ─────────────────────
  const scales = useMemo(() => {
    if (!allData.length) return null
    const xs = allData.map(d => d.x)
    const ys = allData.map(d => d.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rangeX = maxX - minX || 10
    const rangeY = maxY - minY || 10
    const plotW = W - 2 * PAD, plotH = H - 2 * PAD
    const scale = Math.min(plotW / rangeX, plotH / rangeY)
    const extraX = (plotW - rangeX * scale) / 2
    const extraY = (plotH - rangeY * scale) / 2
    return { minX, maxX, minY, maxY, rangeX, rangeY, scale, extraX, extraY }
  }, [allData])

  function toSvg(x, y) {
    if (!scales) return [W / 2, H / 2]
    const { minX, minY, scale, extraX, extraY } = scales
    return [
      PAD + extraX + (x - minX) * scale,
      H - PAD - extraY - (y - minY) * scale,
    ]
  }

  // ── Auto-enable follow when animation starts, disable when it stops ────────
  useEffect(() => {
    if (isAnimating) setFollowMode(true)
    else { setFollowMode(false); setVb({ x: 0, y: 0, w: W, h: H }) }
  }, [isAnimating])

  // ── Auto-center viewBox on cursor when followMode is active ────────────────
  const followAnchor = isAnimating && visibleData.length > 0
    ? visibleData[visibleData.length - 1]
    : null

  useEffect(() => {
    if (!followMode || !followAnchor || !scales) return
    const [cx, cy] = toSvg(followAnchor.x, followAnchor.y)
    const ZOOM_W = W * 0.6    // ~1.7× zoom — follow cursor without over-magnifying
    setVb({ x: cx - ZOOM_W / 2, y: cy - ZOOM_W / 2, w: ZOOM_W, h: ZOOM_W })
  }, [followAnchor?.x, followAnchor?.y, followMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wheel zoom + touch pan (passive:false required for preventDefault) ─────
  useEffect(() => {
    const el = svgRef.current
    if (!el) return

    function onWheel(e) {
      e.preventDefault()
      setFollowMode(false)
      const factor = e.deltaY > 0 ? 1.22 : 1 / 1.22
      const rect = el.getBoundingClientRect()
      const ov = vbRef.current
      const mx = (e.clientX - rect.left) / rect.width  * ov.w + ov.x
      const my = (e.clientY - rect.top)  / rect.height * ov.h + ov.y
      const nw = Math.max(1, ov.w * factor)
      const nv = { x: mx - (mx - ov.x) * (nw / ov.w), y: my - (my - ov.y) * (nw / ov.h), w: nw, h: nw }
      vbRef.current = nv; setVbState(nv)
    }

    function onTouchStart(e) {
      if (e.touches.length === 1)
        touchRef.current = { prevX: e.touches[0].clientX, prevY: e.touches[0].clientY }
    }
    function onTouchMove(e) {
      if (!touchRef.current || e.touches.length !== 1) return
      e.preventDefault()
      setFollowMode(false)
      const rect = el.getBoundingClientRect()
      const ov = vbRef.current
      const dx = (touchRef.current.prevX - e.touches[0].clientX) / rect.width  * ov.w
      const dy = (touchRef.current.prevY - e.touches[0].clientY) / rect.height * ov.h
      const nv = { ...ov, x: ov.x + dx, y: ov.y + dy }
      vbRef.current = nv; setVbState(nv)
      touchRef.current = { prevX: e.touches[0].clientX, prevY: e.touches[0].clientY }
    }
    function onTouchEnd() { touchRef.current = null }

    el.addEventListener('wheel',      onWheel,      { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    return () => {
      el.removeEventListener('wheel',      onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [hasData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mouse drag pan ─────────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button !== 0) return
    setFollowMode(false)
    dragRef.current = { prevX: e.clientX, prevY: e.clientY }
    e.currentTarget.style.cursor = 'grabbing'
  }
  function onMouseMove(e) {
    if (!dragRef.current) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const ov = vbRef.current
    const dx = (dragRef.current.prevX - e.clientX) / rect.width  * ov.w
    const dy = (dragRef.current.prevY - e.clientY) / rect.height * ov.h
    const nv = { ...ov, x: ov.x + dx, y: ov.y + dy }
    vbRef.current = nv; setVbState(nv)
    dragRef.current = { prevX: e.clientX, prevY: e.clientY }
  }
  function onMouseUp(e) {
    dragRef.current = null
    if (e.currentTarget) e.currentTarget.style.cursor = 'grab'
  }

  if (!hasData) return null

  const { minX, maxX, minY, maxY, rangeX, rangeY, scale, extraX, extraY } = scales

  // ── Grid lines ────────────────────────────────────────────────────────────────
  const step = niceStep(Math.max(rangeX, rangeY))
  const pad5 = step * 0.5
  const grids = []
  for (let gx = Math.ceil((minX - pad5) / step) * step; gx <= maxX + pad5; gx += step) {
    const [sx] = toSvg(gx, minY)
    grids.push(
      <line key={`vx${gx}`} x1={sx} y1={PAD + extraY} x2={sx} y2={H - PAD - extraY}
        stroke="rgba(148,163,184,0.15)" strokeDasharray="3,4" strokeWidth="0.5" />,
      <text key={`vl${gx}`} x={sx} y={H - PAD - extraY + 9}
        fill="rgba(148,163,184,0.35)" fontSize="5.5" textAnchor="middle">
        {gx.toFixed(0)}m
      </text>,
    )
  }
  for (let gy = Math.ceil((minY - pad5) / step) * step; gy <= maxY + pad5; gy += step) {
    const [, sy] = toSvg(minX, gy)
    grids.push(
      <line key={`hy${gy}`} x1={PAD + extraX} y1={sy} x2={W - PAD - extraX} y2={sy}
        stroke="rgba(148,163,184,0.15)" strokeDasharray="3,4" strokeWidth="0.5" />,
      <text key={`hl${gy}`} x={PAD + extraX - 2} y={sy + 2}
        fill="rgba(148,163,184,0.35)" fontSize="5.5" textAnchor="end">
        {gy.toFixed(0)}m
      </text>,
    )
  }

  // ── Path segments ─────────────────────────────────────────────────────────────
  // When animating but no visible points yet (waiting for sync), show the full
  // trajectory as a dim ghost so the user can see where the ROV went.
  const isWaiting = isAnimating && visibleData.length === 0
  const renderData = isWaiting ? allData : visibleData

  // The ghost path (entire trajectory) rendered at low opacity when animating
  const ghostPoints = isWaiting ? allData.map(pt => {
    const [x, y] = toSvg(pt.x, pt.y)
    return `${x},${y}`
  }).join(' ') : ''

  // The active/visible path rendered in solid color
  const activePoints = renderData.map(pt => {
    const [x, y] = toSvg(pt.x, pt.y)
    return `${x},${y}`
  }).join(' ')

  const segs = (
    <>
      {isWaiting && ghostPoints && (
        <polyline points={ghostPoints} fill="none" stroke="rgba(59, 130, 246, 0.18)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {activePoints && (
        <polyline points={activePoints} fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </>
  )

  // ── ROV cursor — rotating arrow at active position ────────────────────────────
  // Animating: last visible point with pulse ring
  // Static:    last allData point, no pulse
  const cursorPt = isAnimating
    ? (visibleData.length > 0 ? visibleData[visibleData.length - 1] : null)
    : allData[allData.length - 1]

  let cursor = null
  if (cursorPt) {
    const [cx, cy] = toSvg(cursorPt.x, cursorPt.y)
    const yaw = cursorPt.yaw ?? 0
    cursor = (
      <g>
        {/* Pulse ring — animating only */}
        {isAnimating && visibleData.length > 0 && (
          <circle cx={cx} cy={cy} r={7} fill="#60a5fa" opacity={0.2}>
            <animate attributeName="r"       values="7;14;7"      dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0;0.2"   dur="1.6s" repeatCount="indefinite" />
          </circle>
        )}
        {/* Halo */}
        <circle cx={cx} cy={cy} r={9}
          fill="rgba(96,165,250,0.1)" stroke="rgba(96,165,250,0.4)" strokeWidth="0.8" />
        {/* Arrow — rotate(yaw): 0 = North (up), 90 = East (right) */}
        <g transform={`translate(${cx},${cy}) rotate(${yaw})`}>
          <polygon points="0,-8 -4.5,5.5 0,3 4.5,5.5"
            fill="#60a5fa" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      </g>
    )
  }

  // ── Start dot ─────────────────────────────────────────────────────────────────
  const [ssx, ssy] = toSvg(allData[0].x, allData[0].y)

  // ── Distance so far ───────────────────────────────────────────────────────────
  let dist = 0
  for (let i = 0; i < visibleData.length - 1; i++) {
    const dx = visibleData[i + 1].x - visibleData[i].x
    const dy = visibleData[i + 1].y - visibleData[i].y
    dist += Math.sqrt(dx * dx + dy * dy)
  }

  return (
    <div className="w-full h-full bg-[#0f172a] relative overflow-hidden">
      {/* Interactive SVG */}
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="w-full h-full select-none"
        style={{ cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={() => { setFollowMode(false); setVb({ x: 0, y: 0, w: W, h: H }) }}
        aria-hidden="true"
      >
        {/* Large background rect — covers any zoom level */}
        <rect x="-5000" y="-5000" width="10000" height="10000" fill="#0f172a" />
        {grids}
        {segs}
        {/* Start dot */}
        <circle cx={ssx} cy={ssy} r={3.5} fill="#22c55e" stroke="#fff" strokeWidth="1" />
        {cursor}
      </svg>

      {/* ── Overlay UI ───────────────────────────────────────────────────────── */}

      {/* "Relative" label */}
      <div className="absolute top-1.5 left-2 text-[8px] text-slate-400/55
                      flex items-center gap-1 pointer-events-none select-none">
        <Route size={8} /> Relative
      </div>

      {/* Top-right: LIVE badge + follow button */}
      <div className="absolute top-1.5 right-2 flex items-center gap-1.5 select-none">
        {isAnimating && visibleData.length > 0 && (
          <div className="flex items-center gap-1 pointer-events-none">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
            </span>
            <span className="text-[8px] font-bold text-blue-400">LIVE</span>
          </div>
        )}
        {/* Follow ROV button — blue = following, gray = user has panned away */}
        {isAnimating && (
          <button
            onClick={followMode ? undefined : () => setFollowMode(true)}
            title={followMode ? 'Following ROV' : 'Click to follow ROV'}
            className={`w-5 h-5 rounded flex items-center justify-center transition-colors
                        ${followMode
                          ? 'bg-blue-500 text-white cursor-default'
                          : 'bg-[#1e293b] text-slate-400 hover:text-blue-400 cursor-pointer border border-slate-600'
                        }`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <line x1="12" y1="2" x2="12" y2="6"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="6" y2="12"/>
              <line x1="18" y1="12" x2="22" y2="12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Waiting state — show as subtle bottom label, not a blocking overlay */}
      {isAnimating && visibleData.length === 0 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-[8px] text-blue-400/50 animate-pulse">Waiting for signal…</span>
        </div>
      )}

      {/* Bottom: legend + distance */}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center
                      justify-between pointer-events-none select-none">
        <div className="flex gap-2.5 text-[8px] text-slate-400/50">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />S
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />ROV
          </span>
        </div>
        <span className="text-[8px] text-slate-400/40 font-mono">{dist.toFixed(1)} m</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
// currentUTC: null = static | UTC ms = animate ROV position on trajectory
// mode / onModeChange: controlled from parent (for rendering toggle outside the map)
// onDvlStatus: called with true when GPS + DVL both available, false otherwise
export function TrajectoryViewer({
  tripId, hasGps, gpsLocation, currentUTC = null,
  mode: externalMode, onModeChange, onDvlStatus,
}) {
  const [internalMode, setInternalMode] = useState('path')
  const mode    = externalMode  !== undefined ? externalMode  : internalMode
  const setMode = onModeChange !== undefined  ? onModeChange  : setInternalMode

  const { data: dvlResult, isLoading } = useQuery({
    queryKey: ['dvl-path', tripId],
    queryFn: () => api.get(`/trips/${tripId}/dvl`).then(r => r.data),
    staleTime: 60000,
    enabled: !!tripId,
  })

  const dvlData    = dvlResult?.data ?? []
  const gpsAnchor  = dvlResult?.gpsAnchor ?? null
  const hasDvl     = dvlData.length > 0
  const bothGpsAndDvl = hasDvl && !!gpsAnchor

  // Animation is only meaningful when backend returned absoluteMs (filename had timestamp pattern)
  const hasAbsoluteTime = hasDvl && dvlData.some(p => p.absoluteMs != null)

  // Use the MINIMUM absoluteMs across all points as the sync anchor.
  // This is robust against multiple DVL files with different recordedAt values in the DB
  // (e.g., old file not yet cleaned up) — always anchors to the earliest recording.
  const dvlFirstMs = useMemo(() => {
    if (!hasAbsoluteTime) return null
    let minMs = null
    for (const p of dvlData) {
      if (p.absoluteMs != null && (minMs === null || p.absoluteMs < minMs)) minMs = p.absoluteMs
    }
    return minMs
  }, [dvlData, hasAbsoluteTime])

  // Only animate when currentUTC is within reasonable reach of the first DVL point.
  // If video and DVL sessions are > 10 min apart, show full trajectory statically.
  const SYNC_LOOKAHEAD_MS = 10 * 60 * 1000  // 10 min
  const withinSyncRange = dvlFirstMs == null || currentUTC == null
    || currentUTC >= dvlFirstMs - SYNC_LOOKAHEAD_MS
  const isAnimating = currentUTC != null && hasAbsoluteTime && withinSyncRange

  // Visible data: all if static; filtered prefix by UTC if animated
  const visibleData = useMemo(() => {
    if (!isAnimating) return dvlData
    return dvlData.filter(p => p.absoluteMs != null && p.absoluteMs <= currentUTC)
  }, [dvlData, currentUTC, isAnimating])

  // Full geo path — for fitBounds (stable)
  const geoPath = useMemo(() => {
    if (!gpsAnchor || !dvlData.length) return null
    return dvlData.map(pt => dvlToLatLng(gpsAnchor, pt))
  }, [dvlData, gpsAnchor])

  // Animated geo path — updates each timeupdate (~4×/sec)
  const visibleGeoPath = useMemo(() => {
    if (!gpsAnchor || !visibleData.length) return []
    return visibleData.map(pt => dvlToLatLng(gpsAnchor, pt))
  }, [visibleData, gpsAnchor])

  // Notify parent when DVL + GPS availability changes
  useEffect(() => {
    onDvlStatus?.(bothGpsAndDvl)
  }, [bothGpsAndDvl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Current ROV heading for the arrow marker
  const displayYaw = useMemo(() => {
    const pts = visibleData.length > 0 ? visibleData : dvlData
    return pts.length > 0 ? (pts[pts.length - 1].yaw ?? 0) : 0
  }, [visibleData, dvlData])

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted">
        <span className="text-[10px] text-muted-foreground animate-pulse">Loading…</span>
      </div>
    )
  }

  // ── No DVL: fall back to GPS marker or empty state ────────────────────────────
  if (!hasDvl) {
    if (hasGps && gpsLocation) {
      return <TripMap lat={gpsLocation.lat} lng={gpsLocation.lng} isAnimating={false} />
    }
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted">
        <MapPin size={22} className="text-muted-foreground/40" />
        <p className="text-[10px] text-muted-foreground">No GPS data</p>
      </div>
    )
  }

  // ── Has DVL ───────────────────────────────────────────────────────────────────
  let content
  if (bothGpsAndDvl) {
    if (mode === 'path') {
      content = (
        <RelativePath
          allData={dvlData}
          visibleData={visibleData}
          isAnimating={isAnimating}
        />
      )
    } else {
      content = (
        <TripMap
          key={mode}
          lat={gpsAnchor.lat}
          lng={gpsAnchor.lng}
          dvlPath={mode === 'both' ? visibleGeoPath : null}
          dvlFullPath={mode === 'both' ? geoPath : null}
          dvlYaw={displayYaw}
          isAnimating={isAnimating}
          showMarker={true}
        />
      )
    }
  } else {
    // DVL without GPS anchor → relative SVG only
    content = (
      <RelativePath
        allData={dvlData}
        visibleData={visibleData}
        isAnimating={isAnimating}
      />
    )
  }

  return <div className="w-full h-full">{content}</div>
}
