import React, { useRef, useEffect } from 'react'

export default function DiveMap({ lat, lng }) {
  const ref = useRef(null)
  const inst = useRef(null)

  useEffect(() => {
    if (!ref.current || inst.current) return
    import('leaflet').then(({ default: L }) => {
      if (inst.current || ref.current._leaflet_id) return
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:#3b82f6;border:2px solid white;
               border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,.8)"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      })
      const map = L.map(ref.current, { zoomControl: false, attributionControl: false })
        .setView([lat, lng], 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
      L.marker([lat, lng], { icon }).addTo(map)
      inst.current = map
    })
    return () => { if (inst.current) { inst.current.remove(); inst.current = null } }
  }, [lat, lng])

  return <div ref={ref} className="w-full h-full" />
}
