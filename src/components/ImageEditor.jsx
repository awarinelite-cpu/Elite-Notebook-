import { useEffect, useRef, useState } from 'react'

const ASPECTS = {
  free: null,
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '3:4': 3 / 4,
}

// Renders the image through the current edits (rotation, flip, crop, color)
// onto a canvas sized to the final crop, and returns that canvas.
function renderEdited(img, { rotation, flipH, aspect, brightness, contrast }) {
  const swap = rotation % 180 !== 0
  const rw = swap ? img.naturalHeight : img.naturalWidth
  const rh = swap ? img.naturalWidth : img.naturalHeight

  const rotCanvas = document.createElement('canvas')
  rotCanvas.width = rw
  rotCanvas.height = rh
  const rctx = rotCanvas.getContext('2d')
  rctx.save()
  rctx.translate(rw / 2, rh / 2)
  rctx.rotate((rotation * Math.PI) / 180)
  if (flipH) rctx.scale(-1, 1)
  rctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  rctx.restore()

  let cw = rw, ch = rh, cx = 0, cy = 0
  const targetRatio = ASPECTS[aspect]
  if (targetRatio) {
    const currentRatio = rw / rh
    if (currentRatio > targetRatio) {
      ch = rh
      cw = rh * targetRatio
      cx = (rw - cw) / 2
    } else {
      cw = rw
      ch = rw / targetRatio
      cy = (rh - ch) / 2
    }
  }

  const outCanvas = document.createElement('canvas')
  outCanvas.width = Math.round(cw)
  outCanvas.height = Math.round(ch)
  const octx = outCanvas.getContext('2d')
  octx.filter = `brightness(${brightness}%) contrast(${contrast}%)`
  octx.drawImage(rotCanvas, cx, cy, cw, ch, 0, 0, outCanvas.width, outCanvas.height)
  return outCanvas
}

export default function ImageEditor({ src, onCancel, onSave }) {
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [aspect, setAspect] = useState('free')
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [imgEl, setImgEl] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewRef = useRef(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImgEl(img)
    img.onerror = () => setLoadError(true)
    img.src = src
  }, [src])

  useEffect(() => {
    if (!imgEl || !previewRef.current) return
    try {
      const canvas = renderEdited(imgEl, { rotation, flipH, aspect, brightness, contrast })
      const ctx = previewRef.current.getContext('2d')
      previewRef.current.width = canvas.width
      previewRef.current.height = canvas.height
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(canvas, 0, 0)
    } catch (e) {
      setLoadError(true)
    }
  }, [imgEl, rotation, flipH, aspect, brightness, contrast])

  function reset() {
    setRotation(0)
    setFlipH(false)
    setAspect('free')
    setBrightness(100)
    setContrast(100)
  }

  async function handleSave() {
    if (!imgEl) return
    setSaving(true)
    try {
      const canvas = renderEdited(imgEl, { rotation, flipH, aspect, brightness, contrast })
      canvas.toBlob(
        (blob) => {
          if (blob) onSave(blob)
          else { setLoadError(true); setSaving(false) }
        },
        'image/jpeg',
        0.92
      )
    } catch (e) {
      setLoadError(true)
      setSaving(false)
    }
  }

  return (
    <div className="editor-backdrop" onClick={onCancel}>
      <div className="editor-card" onClick={(e) => e.stopPropagation()}>
        <div className="editor-canvas-wrap">
          {loadError ? (
            <p className="drive-error" style={{ padding: 20 }}>
              Couldn't load this image for editing (it may be blocked by the storage bucket's
              CORS settings). Try again, or edit a fresh screenshot before uploading.
            </p>
          ) : (
            <canvas ref={previewRef} className="editor-canvas" />
          )}
        </div>

        <div className="editor-controls">
          <div className="editor-row">
            <button className="pill-btn" onClick={() => setRotation((r) => (r + 270) % 360)}>⟲ Rotate</button>
            <button className="pill-btn" onClick={() => setRotation((r) => (r + 90) % 360)}>⟳ Rotate</button>
            <button className="pill-btn" onClick={() => setFlipH((f) => !f)}>⇋ Flip</button>
          </div>

          <div className="editor-row">
            {Object.keys(ASPECTS).map((key) => (
              <button
                key={key}
                className={`pill-btn ${aspect === key ? 'pill-btn-active' : ''}`}
                onClick={() => setAspect(key)}
              >
                {key === 'free' ? 'Free' : key}
              </button>
            ))}
          </div>

          <label className="editor-slider-label">
            Brightness
            <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(+e.target.value)} />
          </label>
          <label className="editor-slider-label">
            Contrast
            <input type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(+e.target.value)} />
          </label>

          <div className="editor-row" style={{ marginTop: 8 }}>
            <button className="text-btn" onClick={reset}>Reset</button>
            <button className="text-btn" onClick={onCancel}>Cancel</button>
            <button className="drive-connect-btn" style={{ marginLeft: 'auto' }} onClick={handleSave} disabled={saving || loadError}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
