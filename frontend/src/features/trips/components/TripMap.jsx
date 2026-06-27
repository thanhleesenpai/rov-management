import React, { useRef, useEffect, useState } from 'react'

function makeROVIcon(L, yaw) {
  const deg = yaw ?? 0
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center">
      <svg viewBox="-12 -12 24 24" width="24" height="24" style="overflow:visible">
        <circle r="10" fill="rgba(96,165,250,0.18)" stroke="rgba(96,165,250,0.55)" stroke-width="0.8"/>
        <g class="rov-arrow" transform="rotate(${deg})">
          <polygon points="0,-9 -4.5,6 0,3 4.5,6"
            fill="#60a5fa" stroke="white" stroke-width="1.3" stroke-linejoin="round"/>
        </g>
      </svg>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

// dvlPath:     animated visible subset [lat,lng][] — updates ~4×/sec during playback
// dvlFullPath: full path [lat,lng][] — used only for initial fitBounds
// dvlYaw:      heading of last visible point (0=North, clockwise)
// isAnimating: when true, follow button is shown; auto-follow is on by default
// showMarker:  show GPS anchor dot
export default function TripMap({
  lat, lng,
  dvlPath = null,
  dvlFullPath = null,
  dvlYaw = 0,
  isAnimating = false,
  showMarker = true,
}) {
  const mapRef       = useRef(null)
  const inst         = useRef(null)
  const polylineRef  = useRef(null)
  const rovMarkerRef = useRef(null)
  const isMovingRef  = useRef(false)   // true while we programmatically pan

  // followRov: true = auto-pan to ROV each update (Google Maps nav mode)
  //            false = user freely pans; click button to re-enable
  const [followRov, setFollowRov] = useState(true)

  // ── Init (once) ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || inst.current) return
    import('leaflet').then(({ default: L }) => {
      if (inst.current || mapRef.current._leaflet_id) return

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

      // User drag → disable auto-follow (setFollowRov is stable across renders)
      map.on('dragstart', () => {
        if (!isMovingRef.current) setFollowRov(false)
      })

      const boundsPath = dvlFullPath || dvlPath
      if (boundsPath && boundsPath.length > 0) {
        const boundsPoly = L.polyline(boundsPath)
        map.fitBounds(boundsPoly.getBounds(), { padding: [28, 28] })

        L.circleMarker(boundsPath[0], {
          radius: 5, fillColor: '#22c55e', color: '#fff', weight: 1.5, fillOpacity: 1,
        }).addTo(map)

        const initialPath = dvlPath && dvlPath.length > 0 ? dvlPath : boundsPath
        polylineRef.current = L.polyline(initialPath, {
          color: '#3b82f6', weight: 2.5, opacity: 0.85,
        }).addTo(map)

        const initPos = dvlPath?.length > 0 ? dvlPath[dvlPath.length - 1] : boundsPath[boundsPath.length - 1]
        rovMarkerRef.current = L.marker(initPos, {
          icon: makeROVIcon(L, dvlYaw),
          zIndexOffset: 1000,
        }).addTo(map)

        if (showMarker && lat != null && lng != null) {
          L.marker([lat, lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:10px;height:10px;background:#3b82f6;border:2px solid white;
                     border-radius:50%;box-shadow:0 0 6px rgba(59,130,246,.8)"></div>`,
              iconSize: [10, 10], iconAnchor: [5, 5],
            }),
          }).addTo(map)
        }
      } else {
        map.setView([lat, lng], 15)
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:14px;height:14px;background:#3b82f6;border:2.5px solid white;
                   border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,.8)"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7],
          }),
        }).addTo(map)
      }

      inst.current = map
    })
    return () => {
      if (inst.current) { inst.current.remove(); inst.current = null }
      polylineRef.current = null
      rovMarkerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset follow state when animation stops ────────────────────────────────────
  useEffect(() => {
    if (!isAnimating) setFollowRov(true)
  }, [isAnimating])

  // ── Live update — position, arrow, auto-follow ─────────────────────────────────
  useEffect(() => {
    if (!polylineRef.current) return
    if (dvlPath && dvlPath.length > 0) {
      polylineRef.current.setLatLngs(dvlPath)
      const lastPos = dvlPath[dvlPath.length - 1]

      if (rovMarkerRef.current) {
        rovMarkerRef.current.setLatLng(lastPos)
        rovMarkerRef.current.setOpacity(1)
        const arrow = rovMarkerRef.current.getElement()?.querySelector('.rov-arrow')
        if (arrow) arrow.setAttribute('transform', `rotate(${dvlYaw ?? 0})`)
      }

      if (isAnimating && followRov && inst.current) {
        isMovingRef.current = true
        inst.current.panTo(lastPos, { animate: true, duration: 0.3, easeLinearity: 1 })
        setTimeout(() => { isMovingRef.current = false }, 450)
      }
    } else {
      polylineRef.current.setLatLngs([])
      rovMarkerRef.current?.setOpacity(0)
    }
  }, [dvlPath, dvlYaw, isAnimating, followRov]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-enable follow + snap to ROV immediately ─────────────────────────────────
  function handleFollow() {
    setFollowRov(true)
    if (rovMarkerRef.current && inst.current) {
      isMovingRef.current = true
      inst.current.panTo(rovMarkerRef.current.getLatLng(), { animate: true, duration: 0.4 })
      setTimeout(() => { isMovingRef.current = false }, 550)
    }
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />

      {/* Follow-ROV toggle — visible during animation, Google-Maps style */}
      {isAnimating && (
        <button
          onClick={followRov ? undefined : handleFollow}
          title={followRov ? 'Following ROV' : 'Click to follow ROV'}
          className={`absolute bottom-2 right-2 z-[400] w-7 h-7 rounded-lg shadow-md
                      flex items-center justify-center transition-colors
                      ${followRov
                        ? 'bg-blue-500 border border-blue-500 text-white cursor-default'
                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer'
                      }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
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
  )
}
