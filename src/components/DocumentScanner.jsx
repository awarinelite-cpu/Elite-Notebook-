import { useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import { IconClose, IconTrash } from './Icons.jsx'
import { warpToRectangle } from '../lib/perspective.js'
import { applyScanFilter } from '../lib/scanFilters.js'

const MAX_CAPTURE_DIM = 1600 // downscale before warping — plenty sharp for a note attachment, keeps the per-pixel warp fast
const CORNER_INSET = 0.06 // default guessed corners, 6% in from each edge

const FILTERS = [
  { id: 'enhance', label: 'Enhance' },
  { id: 'original', label: 'Original' },
  { id: 'gray', label: 'Grayscale' },
  { id: 'bw', label: 'B & W' },
]

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function cloneCanvas(canvas) {
  const c = document.createElement('canvas')
  c.width = canvas.width
  c.height = canvas.height
  c.getContext('2d').drawImage(canvas, 0, 0)
  return c
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// A CamScanner-style flow: photograph a document → drag its four corners
// onto the page edges → the app straightens the perspective into a flat
// rectangle → pick a filter (enhance / grayscale / black & white) → repeat
// for more pages → single page saves as an image, multiple pages combine
// into one PDF, both handed back exactly like any other attachment.
export default function DocumentScanner({ onCancel, onSave, onSavePdf }) {
  const [stage, setStage] = useState('capture') // capture | adjust | filter
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [corners, setCorners] = useState(null) // { tl, tr, br, bl } in natural px
  const [filterMode, setFilterMode] = useState('enhance')
  const [threshold, setThreshold] = useState(150)
  const [pages, setPages] = useState([]) // [{ canvas, thumb }]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const captureInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  const rawCanvasRef = useRef(null) // downscaled source photo for the page being adjusted
  const adjustWrapRef = useRef(null)
  const warpedCanvasRef = useRef(null) // perspective-corrected, pre-filter
  const filteredCanvasRef = useRef(null) // visible <canvas> in the filter stage
  const dragKeyRef = useRef(null)

  async function handleFileChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const dataUrl = await fileToDataUrl(file)
      const img = await loadImage(dataUrl)
      const scale = Math.min(1, MAX_CAPTURE_DIM / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      rawCanvasRef.current = canvas
      setNaturalSize({ w, h })
      setCorners({
        tl: { x: w * CORNER_INSET, y: h * CORNER_INSET },
        tr: { x: w * (1 - CORNER_INSET), y: h * CORNER_INSET },
        br: { x: w * (1 - CORNER_INSET), y: h * (1 - CORNER_INSET) },
        bl: { x: w * CORNER_INSET, y: h * (1 - CORNER_INSET) },
      })
      setStage('adjust')
    } catch {
      setError("Couldn't read that photo — try again.")
    }
  }

  function pct(corner) {
    return { left: `${(corner.x / naturalSize.w) * 100}%`, top: `${(corner.y / naturalSize.h) * 100}%` }
  }

  function handleHandleDown(key, e) {
    e.preventDefault()
    dragKeyRef.current = key
    e.target.setPointerCapture(e.pointerId)
  }

  function handleHandleMove(e) {
    const key = dragKeyRef.current
    if (!key || !adjustWrapRef.current) return
    const rect = adjustWrapRef.current.getBoundingClientRect()
    const nx = Math.min(naturalSize.w, Math.max(0, ((e.clientX - rect.left) / rect.width) * naturalSize.w))
    const ny = Math.min(naturalSize.h, Math.max(0, ((e.clientY - rect.top) / rect.height) * naturalSize.h))
    setCorners((c) => ({ ...c, [key]: { x: nx, y: ny } }))
  }

  function handleHandleUp() {
    dragKeyRef.current = null
  }

  function useThisScan() {
    const warped = warpToRectangle(rawCanvasRef.current, corners)
    warpedCanvasRef.current = warped
    setFilterMode('enhance')
    setStage('filter')
  }

  // Re-render the visible filtered preview whenever the mode/threshold
  // changes or we arrive at this stage for a new page.
  useEffect(() => {
    if (stage !== 'filter' || !warpedCanvasRef.current || !filteredCanvasRef.current) return
    applyScanFilter(warpedCanvasRef.current, filteredCanvasRef.current, filterMode, threshold)
  }, [stage, filterMode, threshold])

  function retake() {
    setStage('capture')
  }

  function addPage() {
    const finished = cloneCanvas(filteredCanvasRef.current)
    setPages((p) => [...p, { canvas: finished }])
    setStage('capture')
  }

  function removePage(i) {
    setPages((p) => p.filter((_, idx) => idx !== i))
  }

  async function finishWith(extraPage) {
    const all = extraPage ? [...pages, { canvas: cloneCanvas(filteredCanvasRef.current) }] : pages
    if (all.length === 0) return
    setSaving(true)
    try {
      if (all.length === 1) {
        const blob = await canvasToBlob(all[0].canvas)
        onSave(blob)
      } else {
        const doc = new jsPDF({ unit: 'pt' })
        for (let i = 0; i < all.length; i++) {
          const canvas = all[i].canvas
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
          const pageW = doc.internal.pageSize.getWidth()
          const pageH = doc.internal.pageSize.getHeight()
          const scale = Math.min(pageW / canvas.width, pageH / canvas.height)
          const w = canvas.width * scale
          const h = canvas.height * scale
          if (i > 0) doc.addPage()
          doc.addImage(dataUrl, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h)
        }
        const blob = doc.output('blob')
        onSavePdf(blob)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleKeys = ['tl', 'tr', 'br', 'bl']
  const polygonPoints = corners
    ? handleKeys.map((k) => `${corners[k].x},${corners[k].y}`).join(' ')
    : ''

  return (
    <div className="editor-backdrop" onClick={onCancel}>
      <div className="editor-card drawing-card" onClick={(e) => e.stopPropagation()}>
        <div className="drawing-header">
          <span>Scan document</span>
          <button className="icon-btn" onClick={onCancel} title="Close">
            <IconClose width="18" height="18" />
          </button>
        </div>

        {stage === 'capture' && (
          <div className="editor-controls">
            {error && <div className="pin-error" style={{ marginBottom: 10 }}>{error}</div>}
            <div className="editor-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <button className="drive-connect-btn" onClick={() => captureInputRef.current?.click()}>
                {pages.length ? 'Scan next page' : 'Scan a page'}
              </button>
              <button className="text-btn" onClick={() => galleryInputRef.current?.click()}>
                Choose photo from gallery
              </button>
            </div>
            <input ref={captureInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFileChosen} />
            <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={handleFileChosen} />

            {pages.length > 0 && (
              <>
                <div className="editor-row" style={{ marginTop: 16 }}>
                  {pages.map((p, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img
                        src={p.canvas.toDataURL('image/jpeg', 0.7)}
                        alt={`Page ${i + 1}`}
                        style={{ width: 56, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                      />
                      <button
                        className="icon-btn"
                        onClick={() => removePage(i)}
                        style={{ position: 'absolute', top: -8, right: -8, background: 'var(--surface)', width: 22, height: 22, minHeight: 22 }}
                        title="Remove page"
                      >
                        <IconTrash width="12" height="12" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="editor-row" style={{ marginTop: 8 }}>
                  <button className="drive-connect-btn" style={{ marginLeft: 'auto' }} onClick={() => finishWith(false)} disabled={saving}>
                    {saving ? 'Saving…' : pages.length === 1 ? 'Save scan' : `Save ${pages.length} pages as PDF`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {stage === 'adjust' && corners && (
          <>
            <div
              className="drawing-canvas-wrap"
              ref={adjustWrapRef}
              style={{
                position: 'relative',
                background: '#111',
                touchAction: 'none',
                height: 'auto',
                maxHeight: '55vh',
                aspectRatio: `${naturalSize.w} / ${naturalSize.h}`,
              }}
              onPointerMove={handleHandleMove}
              onPointerUp={handleHandleUp}
            >
              <img
                src={rawCanvasRef.current?.toDataURL('image/jpeg', 0.85)}
                alt="Captured document"
                style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
              />
              <svg
                viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              >
                <polygon points={polygonPoints} fill="rgba(30,86,232,0.18)" stroke="#1E56E8" strokeWidth={Math.max(2, naturalSize.w * 0.003)} />
              </svg>
              {handleKeys.map((k) => (
                <div
                  key={k}
                  onPointerDown={(e) => handleHandleDown(k, e)}
                  style={{
                    position: 'absolute',
                    ...pct(corners[k]),
                    width: 26,
                    height: 26,
                    marginLeft: -13,
                    marginTop: -13,
                    borderRadius: '50%',
                    background: '#1E56E8',
                    border: '3px solid #fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                    touchAction: 'none',
                  }}
                />
              ))}
            </div>
            <div className="editor-controls">
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 10px' }}>
                Drag the corners to match the edges of the page.
              </p>
              <div className="editor-row">
                <button className="text-btn" onClick={retake}>Retake</button>
                <button className="drive-connect-btn" style={{ marginLeft: 'auto' }} onClick={useThisScan}>
                  Use this scan
                </button>
              </div>
            </div>
          </>
        )}

        {stage === 'filter' && (
          <>
            <div className="editor-canvas-wrap">
              <canvas ref={filteredCanvasRef} className="editor-canvas" />
            </div>
            <div className="editor-controls">
              <div className="editor-row">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    className={`pill-btn ${filterMode === f.id ? 'pill-btn-active' : ''}`}
                    onClick={() => setFilterMode(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {filterMode === 'bw' && (
                <label className="editor-slider-label">
                  Threshold
                  <input type="range" min="60" max="220" value={threshold} onChange={(e) => setThreshold(+e.target.value)} />
                </label>
              )}
              <div className="editor-row" style={{ marginTop: 8 }}>
                <button className="text-btn" onClick={retake}>Retake</button>
                <button className="pill-btn" style={{ marginLeft: 'auto' }} onClick={addPage}>
                  Add another page
                </button>
                <button className="drive-connect-btn" onClick={() => finishWith(true)} disabled={saving}>
                  {saving ? 'Saving…' : 'Done'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
