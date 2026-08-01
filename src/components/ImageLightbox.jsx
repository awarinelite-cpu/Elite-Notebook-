import { IconClose } from './Icons.jsx'

export default function ImageLightbox({ images, index, onClose, onNavigate }) {
  const hasMultiple = images.length > 1

  function go(delta) {
    const next = (index + delta + images.length) % images.length
    onNavigate(next)
  }

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <IconClose width="22" height="22" />
      </button>

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
