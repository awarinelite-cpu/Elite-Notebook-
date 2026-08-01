import { NOTE_COLORS } from '../constants.js'
import { IconBell, IconPin, IconUnpin, IconArchive, IconTrash, IconRestore, IconClose } from './Icons.jsx'

function formatReminder(ts) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function NoteCard({ note, labels, onEdit, onTogglePin, onArchive, onTrash, onRestore, onDeleteForever, onToggleChecklistItem, view }) {
  const overdue = note.reminderAt && new Date(note.reminderAt) < new Date()
  const noteLabels = (note.labels || []).map((id) => labels.find((l) => l.id === id)).filter(Boolean)

  return (
    <div
      className="note-card"
      style={{ background: NOTE_COLORS[note.color] || NOTE_COLORS.default }}
      onClick={() => onEdit(note)}
    >
      {note.reminderAt && (
        <div className={`reminder-tag ${overdue ? 'overdue' : ''}`}>
          <IconBell width="12" height="12" /> {formatReminder(note.reminderAt)}
        </div>
      )}

      {note.title && <h3>{note.title}</h3>}

      {note.images?.[0] && <img src={note.images[0]} alt="" />}

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
  )
}
