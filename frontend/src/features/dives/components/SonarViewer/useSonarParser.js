import { useState, useEffect } from 'react'

const MAGIC      = 'SONAR360'
const HEADER_SZ  = 32
const FRAME_HDR  = 12  // timestampMs(8) + angleGrads(2) + numSamples(2)

export function parseSonarBuffer(buffer) {
  if (buffer.byteLength < HEADER_SZ) throw new Error('File too small')

  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 8))
  if (magic !== MAGIC) throw new Error(`Invalid sonar file (magic "${magic}")`)

  const view   = new DataView(buffer)
  const frames = []
  let offset   = HEADER_SZ

  while (offset + FRAME_HDR <= buffer.byteLength) {
    // int64 LE split into two uint32s — safe for millisecond timestamps
    const lo         = view.getUint32(offset,     true)
    const hi         = view.getInt32 (offset + 4, true)
    const timestampMs = hi * 0x100000000 + lo
    const angleGrads  = view.getUint16(offset + 8,  true)
    const numSamples  = view.getUint16(offset + 10, true)
    const frameSize   = FRAME_HDR + numSamples

    if (offset + frameSize > buffer.byteLength) break

    // Keep a view into the original buffer (zero-copy)
    const data = new Uint8Array(buffer, offset + FRAME_HDR, numSamples)
    frames.push({ timestampMs, angleGrads, data })
    offset += frameSize
  }

  const durationMs = frames.length >= 2
    ? frames[frames.length - 1].timestampMs - frames[0].timestampMs
    : 0

  return { frames, frameCount: frames.length, durationMs }
}

// Hook: fetch binary from presigned URL → parse → return frames + progress
export function useSonarParser(url) {
  const [state, setState] = useState({
    frames: null, frameCount: 0, durationMs: 0,
    loading: false, error: null, progress: 0,
  })

  useEffect(() => {
    if (!url) {
      setState({ frames: null, frameCount: 0, durationMs: 0, loading: false, error: null, progress: 0 })
      return
    }

    setState(s => ({ ...s, frames: null, loading: true, error: null, progress: 0 }))

    let cancelled = false
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.responseType = 'arraybuffer'

    xhr.onprogress = e => {
      if (!cancelled && e.lengthComputable)
        setState(s => ({ ...s, progress: Math.round(e.loaded / e.total * 100) }))
    }

    xhr.onload = () => {
      if (cancelled) return
      try {
        const result = parseSonarBuffer(xhr.response)
        setState({ ...result, loading: false, error: null, progress: 100 })
      } catch (e) {
        setState(s => ({ ...s, loading: false, error: e.message }))
      }
    }

    xhr.onerror = () => {
      if (!cancelled) setState(s => ({ ...s, loading: false, error: 'Network error' }))
    }

    xhr.send()
    return () => { cancelled = true; xhr.abort() }
  }, [url])

  return state
}
