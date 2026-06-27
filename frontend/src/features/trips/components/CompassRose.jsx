export default function CompassRose({ yaw = 0, active = true }) {
  const cx = 50, cy = 50, r = 42
  const heading = ((Math.round(yaw) % 360) + 360) % 360

  const cardinals = [
    { label: 'N',  deg: 0,   color: '#f87171', size: 8,   bold: true  },
    { label: 'NE', deg: 45,  color: '#7dd3fc', size: 5.5, bold: false },
    { label: 'E',  deg: 90,  color: '#94a3b8', size: 7,   bold: false },
    { label: 'SE', deg: 135, color: '#7dd3fc', size: 5.5, bold: false },
    { label: 'S',  deg: 180, color: '#94a3b8', size: 7,   bold: false },
    { label: 'SW', deg: 225, color: '#7dd3fc', size: 5.5, bold: false },
    { label: 'W',  deg: 270, color: '#94a3b8', size: 7,   bold: false },
    { label: 'NW', deg: 315, color: '#7dd3fc', size: 5.5, bold: false },
  ]

  const ticks = Array.from({ length: 36 }, (_, i) => ({
    deg:   i * 10,
    major: i % 3 === 0,
  }))

  return (
    <div className={`flex flex-col items-center gap-1 transition-opacity duration-300 min-w-0 flex-1 ${active ? 'opacity-100' : 'opacity-35'}`}>
      <svg viewBox="0 0 100 100" className="w-full h-auto max-w-[120px]">
        {/* Background */}
        <circle cx={cx} cy={cy} r={r + 3} fill="#0a1628" />
        <circle cx={cx} cy={cy} r={r}     fill="#0f172a" />

        {/* ── rotating compass rose ── */}
        <g transform={`rotate(${-yaw}, ${cx}, ${cy})`}>

          {/* Degree ticks */}
          {ticks.map(({ deg, major }) => {
            const rad = (deg - 90) * Math.PI / 180
            const r1  = major ? r - 7 : r - 4
            return (
              <line key={deg}
                x1={cx + r1 * Math.cos(rad)} y1={cy + r1 * Math.sin(rad)}
                x2={cx + r  * Math.cos(rad)} y2={cy + r  * Math.sin(rad)}
                stroke={major ? '#4b6a9a' : '#1e3a5f'}
                strokeWidth={major ? 1.5 : 0.8} />
            )
          })}

          {/* Cardinal + intercardinal labels */}
          {cardinals.map(({ label, deg, color, size, bold }) => {
            const rad   = (deg - 90) * Math.PI / 180
            const textR = r - 14
            return (
              <text key={label}
                x={cx + textR * Math.cos(rad)}
                y={cy + textR * Math.sin(rad) + size * 0.38}
                textAnchor="middle"
                fontSize={size}
                fontWeight={bold ? 'bold' : 'normal'}
                fill={color}>
                {label}
              </text>
            )
          })}

          {/* Compass rose lines at N/S/E/W */}
          {[0, 90, 180, 270].map(deg => {
            const rad = (deg - 90) * Math.PI / 180
            return (
              <line key={`rose-${deg}`}
                x1={cx} y1={cy}
                x2={cx + (r - 20) * Math.cos(rad)}
                y2={cy + (r - 20) * Math.sin(rad)}
                stroke={deg === 0 ? '#f8717160' : '#1e3a5f'}
                strokeWidth="0.8" strokeDasharray="2 3" />
            )
          })}
        </g>

        {/* ── heading readout (fixed, top center) ── */}
        <rect x={cx - 15} y={cy - r - 1} width="30" height="13" rx="3"
          fill="#1e293b" stroke="#334155" strokeWidth="1" />
        <text x={cx} y={cy - r + 9} textAnchor="middle" fontSize="8"
          fill="white" fontFamily="monospace" fontWeight="bold">
          {String(heading).padStart(3, '0')}°
        </text>

        {/* Fixed heading indicator (▼ triangle pointing down) */}
        <polygon
          points={`${cx - 4.5},${cy - r + 13} ${cx + 4.5},${cy - r + 13} ${cx},${cy - r + 19}`}
          fill="#ef4444" />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3"   fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="1.2" fill="#94a3b8" />

        {/* Bezel rings */}
        <circle cx={cx} cy={cy} r={r}     fill="none" stroke="#1e3a5f" strokeWidth="1"   />
        <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke="#334155" strokeWidth="1.5" />
      </svg>
      <p className="text-[8px] text-muted-foreground font-semibold tracking-widest uppercase">
        Compass
      </p>
    </div>
  )
}
