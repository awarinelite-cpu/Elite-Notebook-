import { useState } from 'react'
import { getNoteColors, NOTE_BACKGROUNDS } from '../constants.js'
import { IconBell, IconPin, IconUnpin, IconArchive, IconTrash, IconRestore, IconClose, IconFileDoc } from './Icons.jsx'
import ImageLightbox from './ImageLightbox.jsx'
import { useTheme } from '../context/ThemeContext.jsx'

function formatReminder(ts) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function NoteCard({ note, labels, onEdit, onTogglePin, onArchive, onTrash, onRestore, onDeleteForever, onToggleChecklistItem, view }) {
  const { theme } = useTheme()
  const NOTE_COLORS = getNoteColors(theme)
  const overdue = note.reminderAt && new Date(note.reminderAt) < new Date()
  const noteLabels = (note.labels || []).map((id) => labels.find((l) => l.id === id)).filter(Boolean)
  const images = note.images || []
  const [lightboxIndex, setLightboxIndex] = useState(null)

  return (
    <>
    <div
      className="note-card"
      style={{
        background:
          note.background && note.background !== 'none'
            ? NOTE_BACKGROUNDS[note.background]
            : NOTE_COLORS[note.color] || NOTE_COLORS.default,
      }}
      onClick={() => onEdit(note)}
    >
      {note.reminderAt && (
        <div className={`reminder-tag ${overdue ? 'overdue' : ''}`}>
          <IconBell width="12" height="12" /> {formatReminder(note.reminderAt)}
        </div>
      )}

      {note.title && <h3>{note.title}</h3>}

      {images.length === 1 && (
        <img
          src={images[0]}
          alt=""
          onClick={(e) => { e.stopPropagation(); setLightboxIndex(0) }}
        />
      )}

      {images.length > 1 && (
        <div
          className={`note-card-collage collage-${Math.min(images.length, 6)}`}
          onClick={(e) => e.stopPropagation()}
        >
          {images.slice(0, 6).map((src, i) => (
            <div key={i} className="collage-tile" onClick={() => setLightboxIndex(i)}>
              <img src={src} alt="" />
              {i === 5 && images.length > 6 && (
                <div className="collage-more">+{images.length - 6}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {note.audio?.length > 0 && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
          {note.audio.map((src, i) => (
            <audio key={i} controls src={src} style={{ width: '100%', height: 32 }} />
          ))}
        </div>
      )}

      {note.files?.length > 0 && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
          {note.files.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="audio-clip-row"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <IconFileDoc width="16" height="16" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            </a>
          ))}
        </div>
      )}

      {note.text && <p>{note.text}</p>}

      {note.checklist?.length > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          {note.checklist.map((item) => (
            <label className={`checklist-item ${item.done ? 'done' : ''}`} key={item.id}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggleChecklistItem(note, item.id)}
              />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      )}

      {noteLabels.length > 0 && (
        <div className="note-labels">
          {noteLabels.map((l) => (
            <span className="label-chip" key={l.id}>{l.name}</span>
          ))}
        </div>
      )}

      <div className="note-actions" onClick={(e) => e.stopPropagation()}>
        {view !== 'trash' ? (
          <>
            <button className="icon-btn" title={note.pinned ? 'Unpin' : 'Pin'} onClick={() => onTogglePin(note)}>
              {note.pinned ? <IconUnpin /> : <IconPin />}
            </button>
            <button className="icon-btn" title={note.archived ? 'Unarchive' : 'Archive'} onClick={() => onArchive(note)}>
              <IconArchive width="18" height="18" />
            </button>
            <button className="icon-btn" title="Move to trash" onClick={() => onTrash(note)}>
              <IconTrash width="18" height="18" />
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn" title="Restore" onClick={() => onRestore(note)}>
              <IconRestore />
            </button>
            <button className="icon-btn" title="Delete forever" onClick={() => onDeleteForever(note.id)}>
              <IconClose width="18" height="18" />
            </button>
          </>
        )}
      </div>
    </div>

    {lightboxIndex !== null && (
      <ImageLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    )}
    </>
  )
}
