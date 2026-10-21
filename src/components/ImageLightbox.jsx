import { useRef, useState } from 'react'
import { IconClose, IconEdit, IconTrash } from './Icons.jsx'
import { AttachmentImg } from './AttachmentMedia.jsx'

export default function ImageLightbox({ images, index, onClose, onNavigate, onEdit, onDelete }) {
  const hasMultiple = images.length > 1

  function go(delta) {
    const next = (index + delta + images.length) % images.length
    onNavigate(next)
  }

  // Swipe left/right to move between pictures (the arrow buttons still work).
  const start = useRef(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)

  function onTouchStart(e) {
    if (!hasMultiple || e.touches.length !== 1) { start.current = null; return }
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horiz: null }
  }
  function onTouchMove(e) {
    const st = start.current
    if (!st || e.touches.length !== 1) return
    const mx = e.touches[0].clientX - st.x
    const my = e.touches[0].clientY - st.y
    if (st.horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) st.horiz = Math.abs(mx) > Math.abs(my)
    if (st.horiz) { setDragging(true); setDx(mx) }
  }
  function onTouchEnd() {
    const st = start.current
    start.current = null
    const moved = dx
    setDragging(false)
    setDx(0)
    if (st?.horiz && Math.abs(moved) > 60) go(moved < 0 ? 1 : -1)
  }

  return (
    <div
      className="lightbox-backdrop"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <button className="lightbox-action" onClick={() => onEdit(index)} aria-label="Edit image" title="Edit">
            <IconEdit width="20" height="20" />
          </button>
        )}
        {onDelete && (
          <button className="lightbox-action" onClick={() => onDelete(index)} aria-label="Delete image" title="Delete">
            <IconTrash width="20" height="20" />
          </button>
        )}
        <button className="lightbox-action" onClick={onClose} aria-label="Close">
          <IconClose width="22" height="22" />
        </button>
      </div>

      {hasMultiple && (
        <button
          className="lightbox-nav lightbox-prev"
          onClick={(e) => { e.stopPropagation(); go(-1) }}
          aria-label="Previous image"
        >
          &#8249;
        </button>
      )}

      <AttachmentImg
        className="lightbox-img"
        src={images[index]}
        alt=""
        crossOrigin="anonymous"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          opacity: dx ? Math.max(0.4, 1 - Math.abs(dx) / 500) : 1,
          transition: dragging ? 'none' : 'transform 0.18s ease, opacity 0.18s ease',
          touchAction: 'pan-y',
        }}
      />

      {hasMultiple && (
        <button
          className="lightbox-nav lightbox-next"
          onClick={(e) => { e.stopPropagation(); go(1) }}
          aria-label="Next image"
        >
          &#8250;
        </button>
      )}

      {hasMultiple && (
        <div className="lightbox-counter">{index + 1} / {images.length}</div>
      )}
    </div>
  )
}
