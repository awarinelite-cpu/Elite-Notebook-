import { useEffect, useRef, useState } from 'react'
import { IconUndo, IconEraser, IconClose } from './Icons.jsx'

const PEN_COLORS = ['#202124', '#EA4335', '#FBBC04', '#34A853', '#4285F4', '#A142F4', '#FFFFFF']
const SIZES = [
  { id: 'thin', label: 'Thin', width: 2.5 },
  { id: 'medium', label: 'Medium', width: 5 },
  { id: 'thick', label: 'Thick', width: 10 },
]

// A simple full-screen freehand drawing pad. Draws onto a white canvas at
// device-pixel-ratio resolution, keeps a stack of snapshots for undo, and
// hands back a PNG blob on save — which the caller treats exactly like any
// other picked image.
export default function DrawingCanvas({ onCancel, onSave }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const history = useRef([])
  const [color, setColor] = useState(PEN_COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [erasing, setErasing] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ratio = window.devicePixelRatio || 1
    const rect = wrap.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    pushHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pushHistory() {
    const canvas = canvasRef.current
    history.current = [...history.current.slice(-19), canvas.toDataURL('image/png')]
    setCanUndo(history.current.length > 1)
  }

  function pointerPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handleDown(e) {
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pointerPos(e)
  }

  function handleMove(e) {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const pos = pointerPos(e)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = size.width
    ctx.strokeStyle = erasing ? '#FFFFFF' : color
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    last.current = pos
  }

  function handleUp() {
    if (!drawing.current) return
    drawing.current = false
    pushHistory()
  }

  function undo() {
    if (history.current.length <= 1) return
    history.current = history.current.slice(0, -1)
    setCanUndo(history.current.length > 1)
    const dataUrl = history.current[history.current.length - 1]
    const canvas = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      ctx.scale(ratio, ratio)
    }
    img.src = dataUrl
  }

  function clearAll() {
    const canvas = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(ratio, ratio)
    pushHistory()
  }

  function handleSave() {
    setSaving(true)
    canvasRef.current.toBlob(
      (blob) => {
        if (blob) onSave(blob)
        setSaving(false)
      },
      'image/png',
      0.95
    )
  }

  return (
    <div className="editor-backdrop" onClick={onCancel}>
      <div className="editor-card drawing-card" onClick={(e) => e.stopPropagation()}>
        <div className="drawing-header">
          <span>Drawing</span>
          <button className="icon-btn" onClick={onCancel} title="Close">
            <IconClose width="18" height="18" />
          </button>
        </div>

        <div className="drawing-canvas-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="drawing-canvas"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
          />
        </div>

        <div className="editor-controls">
          <div className="editor-row">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${!erasing && color === c ? 'selected' : ''}`}
                style={{ background: c, border: c === '#FFFFFF' ? '1px solid var(--border)' : '1px solid rgba(0,0,0,0.1)' }}
                onClick={() => { setColor(c); setErasing(false) }}
                aria-label={c}
              />
            ))}
            <button
              className={`pill-btn ${erasing ? 'pill-btn-active' : ''}`}
              onClick={() => setErasing((v) => !v)}
              title="Eraser"
            >
              <IconEraser width="16" height="16" />
            </button>
          </div>

          <div className="editor-row">
            {SIZES.map((s) => (
              <button
                key={s.id}
                className={`pill-btn ${size.id === s.id ? 'pill-btn-active' : ''}`}
                onClick={() => setSize(s)}
              >
                {s.label}
              </button>
            ))}
            <button className="pill-btn" onClick={undo} disabled={!canUndo} title="Undo">
              <IconUndo width="16" height="16" />
            </button>
            <button className="text-btn" onClick={clearAll}>Clear</button>
          </div>

          <div className="editor-row" style={{ marginTop: 8 }}>
            <button className="text-btn" onClick={onCancel}>Cancel</button>
            <button className="drive-connect-btn" style={{ marginLeft: 'auto' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
