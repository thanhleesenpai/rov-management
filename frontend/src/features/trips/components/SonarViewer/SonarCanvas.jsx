import { forwardRef, useImperativeHandle, useRef } from 'react'

// Map intensity byte (0–255) → [R, G, B]
const COLOR_FNS = {
  heatmap: v => {
    if (v < 85) {
      const t = v / 85
      return [0, Math.round(t * 255), Math.round(255 * (1 - t))]
    } else if (v < 170) {
      const t = (v - 85) / 85
      return [Math.round(t * 255), 255, 0]
    } else {
      const t = (v - 170) / 85
      return [255, Math.round(255 * (1 - t)), 0]
    }
  },
  green:  v => [0, Math.min(255, Math.round(v * 0.9 + 20)), 0],
  white:  v => [v, v, v],
  yellow: v => [v, Math.round(v * 0.85), 0],
}

function drawSpokeOnCtx(ctx, w, h, frame, colorFn, maxRange) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(cx, cy) - 2
  // angleGrads 0–399 → radians, 0 = top (North) clockwise
  const angle = (frame.angleGrads / 400) * 2 * Math.PI - Math.PI / 2
  const cosA  = Math.cos(angle)
  const sinA  = Math.sin(angle)
  const nDraw = Math.floor(frame.data.length * Math.max(0.01, Math.min(1, maxRange)))

  for (let i = 0; i < nDraw; i++) {
    const v = frame.data[i]
    if (v < 6) continue   // skip near-zero noise
    const r = (i / frame.data.length) * maxR
    const x = Math.round(cx + cosA * r)
    const y = Math.round(cy + sinA * r)
    const [R, G, B] = colorFn(v)
    ctx.fillStyle = `rgb(${R},${G},${B})`
    ctx.fillRect(x, y, 1, 1)
  }
}

// Imperative API:
//   ref.clear()
//   ref.drawSpoke(frame, colorMode, maxRange)
export const SonarCanvas = forwardRef(function SonarCanvas(_, ref) {
  const canvasRef = useRef(null)

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvasRef.current
      if (!c) return
      c.getContext('2d').clearRect(0, 0, c.width, c.height)
    },
    drawSpoke(frame, colorMode = 'heatmap', maxRange = 1.0) {
      const c = canvasRef.current
      if (!c || !frame) return
      const ctx  = c.getContext('2d')
      const fn   = COLOR_FNS[colorMode] ?? COLOR_FNS.heatmap
      drawSpokeOnCtx(ctx, c.width, c.height, frame, fn, maxRange)
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={400}
      className="w-full h-full object-contain bg-black"
    />
  )
})
