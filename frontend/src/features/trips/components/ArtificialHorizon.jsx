export default function ArtificialHorizon({ pitch = 0, roll = 0, active = true }) {
  const cx = 50, cy = 50, r = 45
  const scale = 2.2
  const p = Math.max(-40, Math.min(40, pitch))
  const horizonY = cy + p * scale

  const pitchLines = [-20, -10, 10, 20]
  const bankTicks  = [-60, -30, 0, 30, 60]

  return (
    <div className={`flex flex-col items-center gap-1 transition-opacity duration-300 min-w-0 flex-1 ${active ? 'opacity-100' : 'opacity-35'}`}>
      <svg viewBox="0 0 100 100" className="w-full h-auto max-w-[120px]">
        <defs>
          <clipPath id="ah-clip">
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>

        {/* ── rotating horizon + pitch ladder ── */}
        <g clipPath="url(#ah-clip)" transform={`rotate(${-roll}, ${cx}, ${cy})`}>
          {/* Sky */}
          <rect x="0" y="0" width="100" height={horizonY} fill="#1a3a6b" />
          {/* Ground */}
          <rect x="0" y={horizonY} width="100" height="100" fill="#4a2810" />
          {/* Horizon line */}
          <line x1="0" y1={horizonY} x2="100" y2={horizonY}
            stroke="#e2e8f0" strokeWidth="1.5" />

          {/* Pitch ladder */}
          {pitchLines.map(deg => {
            const y   = horizonY - deg * scale
            const hw  = Math.abs(deg) === 10 ? 11 : 18
            return (
              <g key={deg}>
                <line x1={cx - hw} y1={y} x2={cx + hw} y2={y}
                  stroke="white" strokeWidth="1" opacity="0.85" />
                <text x={cx - hw - 4} y={y + 3} fontSize="5.5" fill="white"
                  textAnchor="end" opacity="0.9">{Math.abs(deg)}</text>
                <text x={cx + hw + 4} y={y + 3} fontSize="5.5" fill="white"
                  textAnchor="start" opacity="0.9">{Math.abs(deg)}</text>
              </g>
            )
          })}

          {/* Zero pitch line (wider) */}
          <line x1={cx - 25} y1={horizonY} x2={cx - 8} y2={horizonY}
            stroke="#e2e8f0" strokeWidth="1.5" />
          <line x1={cx + 8}  y1={horizonY} x2={cx + 25} y2={horizonY}
            stroke="#e2e8f0" strokeWidth="1.5" />
        </g>

        {/* ── bank angle arc ticks (fixed) ── */}
        {bankTicks.map(deg => {
          const rad   = (deg - 90) * Math.PI / 180
          const isRef = deg === 0
          const len   = isRef ? 7 : 5
          return (
            <line key={deg}
              x1={cx + (r - len) * Math.cos(rad)} y1={cy + (r - len) * Math.sin(rad)}
              x2={cx + r         * Math.cos(rad)} y2={cy + r         * Math.sin(rad)}
              stroke={isRef ? '#94a3b8' : '#475569'}
              strokeWidth={isRef ? 2 : 1.2} />
          )
        })}

        {/* ── bank pointer (rotates with roll) ── */}
        <g transform={`rotate(${-roll}, ${cx}, ${cy})`}>
          <polygon
            points={`${cx},${cy - r + 5} ${cx - 4},${cy - r + 13} ${cx + 4},${cy - r + 13}`}
            fill="#f59e0b" />
        </g>

        {/* ── fixed aircraft symbol ── */}
        <line x1={cx - 20} y1={cy} x2={cx - 5}  y2={cy}
          stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        <line x1={cx + 5}  y1={cy} x2={cx + 20} y2={cy}
          stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        <rect x={cx - 1.5} y={cy - 4} width="3" height="8"
          fill="#f59e0b" rx="1" />
        <circle cx={cx} cy={cy} r="2.5" fill="#f59e0b" />

        {/* Bezel */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#475569" strokeWidth="2" />
      </svg>
      <p className="text-[8px] text-muted-foreground font-semibold tracking-widest uppercase">
        Pitch / Roll
      </p>
    </div>
  )
}
