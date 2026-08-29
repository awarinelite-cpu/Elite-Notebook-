import { IconClose, IconEdit, IconTrash } from './Icons.jsx'

export default function ImageLightbox({ images, index, onClose, onNavigate, onEdit, onDelete }) {
  const hasMultiple = images.length > 1

  function go(delta) {
    const next = (index + delta + images.length) % images.length
    onNavigate(next)
  }

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
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

      <img
        className="lightbox-img"
        src={images[index]}
        alt=""
        crossOrigin="anonymous"
        onClick={(e) => e.stopPropagation()}
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
