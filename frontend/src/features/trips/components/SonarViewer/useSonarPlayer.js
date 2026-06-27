import { useState, useRef, useEffect, useCallback } from 'react'

export function useSonarPlayer({ frames, canvasRef, colorMode, maxRange }) {
  const [playing,  setPlaying]  = useState(false)
  const [frameIdx, setFrameIdx] = useState(0)
  const [speed,    setSpeedSt]  = useState(1)

  // Mutable refs prevent stale closures inside rAF loop
  const sr  = useRef({ playing: false, frameIdx: 0, speed: 1, lastWallMs: 0 })
  const raf = useRef(null)

  // ── Drawing helpers ──────────────────────────────────────────────────────────

  const drawSpoke = useCallback((idx) => {
    if (!canvasRef.current || !frames?.[idx]) return
    canvasRef.current.drawSpoke(frames[idx], colorMode, maxRange)
  }, [canvasRef, frames, colorMode, maxRange])

  // Rebuild the canvas view up to `toIdx` by collecting the most-recent frame
  // per angle scanning backwards — at most 400 unique angles (1 full rotation).
  const rebuildView = useCallback((toIdx) => {
    if (!canvasRef.current || !frames?.length) return
    const byAngle = new Map()
    for (let i = toIdx; i >= 0 && byAngle.size < 400; i--) {
      const ag = frames[i].angleGrads
      if (!byAngle.has(ag)) byAngle.set(ag, i)
    }
    canvasRef.current.clear()
    ;[...byAngle.values()]
      .sort((a, b) => a - b)
      .forEach(fi => canvasRef.current.drawSpoke(frames[fi], colorMode, maxRange))
  }, [canvasRef, frames, colorMode, maxRange])

  // ── Controls ─────────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    sr.current.playing = false
    setPlaying(false)
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null }
  }, [])

  const play = useCallback(() => {
    if (!frames?.length) return
    // Restart from 0 if at end
    if (sr.current.frameIdx >= frames.length - 1) {
      canvasRef.current?.clear()
      sr.current.frameIdx = 0
      setFrameIdx(0)
    }
    sr.current.playing   = true
    sr.current.lastWallMs = performance.now()
    setPlaying(true)

    function tick(nowMs) {
      if (!sr.current.playing) return
      const { frameIdx: fi, speed, lastWallMs } = sr.current
      const dtMs = (nowMs - lastWallMs) * speed
      sr.current.lastWallMs = nowMs

      const t0   = frames[0].timestampMs
      const tEnd = frames[fi].timestampMs - t0 + dtMs

      // Advance past all frames whose relative time ≤ tEnd
      let next = fi
      while (next + 1 < frames.length && frames[next + 1].timestampMs - t0 <= tEnd) next++

      for (let i = fi + 1; i <= next; i++) {
        if (canvasRef.current) canvasRef.current.drawSpoke(frames[i], colorMode, maxRange)
      }

      sr.current.frameIdx = next
      setFrameIdx(next)

      if (next >= frames.length - 1) {
        sr.current.playing = false
        setPlaying(false)
        return
      }
      raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
  }, [frames, colorMode, maxRange, canvasRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const seekTo = useCallback((targetIdx) => {
    const idx = Math.max(0, Math.min(targetIdx, (frames?.length ?? 1) - 1))
    sr.current.frameIdx = idx
    setFrameIdx(idx)
    rebuildView(idx)
  }, [frames, rebuildView])

  const seekToTime = useCallback((ms) => {
    if (!frames?.length) return
    const t0 = frames[0].timestampMs
    // Binary search for largest index where ts−t0 ≤ ms
    let lo = 0, hi = frames.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (frames[mid].timestampMs - t0 <= ms) lo = mid
      else hi = mid - 1
    }
    seekTo(lo)
  }, [frames, seekTo])

  // Efficient sync: forward small advance = draw incrementally (no clear).
  // Backward or large jump = full rebuild. Avoids React re-renders during
  // continuous video playback by skipping setFrameIdx for small advances.
  const syncToTime = useCallback((ms) => {
    if (!frames?.length) return
    const t0 = frames[0].timestampMs
    let lo = 0, hi = frames.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (frames[mid].timestampMs - t0 <= ms) lo = mid
      else hi = mid - 1
    }
    const targetIdx = lo
    const currentIdx = sr.current.frameIdx
    if (targetIdx === currentIdx) return

    if (targetIdx > currentIdx && targetIdx - currentIdx <= 20) {
      // Small forward: draw new spokes only, skip React state update
      for (let i = currentIdx + 1; i <= targetIdx; i++) {
        canvasRef.current?.drawSpoke(frames[i], colorMode, maxRange)
      }
      sr.current.frameIdx = targetIdx
    } else {
      // Large jump or backward: full rebuild
      rebuildView(targetIdx)
      sr.current.frameIdx = targetIdx
      setFrameIdx(targetIdx)
    }
  }, [frames, canvasRef, colorMode, maxRange, rebuildView])

  const setSpeed = useCallback((s) => {
    sr.current.speed = s
    setSpeedSt(s)
  }, [])

  // Reset when frames change (new file loaded)
  useEffect(() => {
    pause()
    sr.current.frameIdx = 0
    setFrameIdx(0)
    canvasRef.current?.clear()
  }, [frames]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when colorMode or maxRange changes
  useEffect(() => {
    if (frames?.length) rebuildView(sr.current.frameIdx)
  }, [colorMode, maxRange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  const durationMs = frames?.length >= 2
    ? frames[frames.length - 1].timestampMs - frames[0].timestampMs
    : 0
  const currentMs = frames?.length > 0 && frameIdx < frames.length
    ? frames[frameIdx].timestampMs - frames[0].timestampMs
    : 0

  return { playing, frameIdx, speed, durationMs, currentMs, play, pause, seekTo, seekToTime, syncToTime, setSpeed }
}
