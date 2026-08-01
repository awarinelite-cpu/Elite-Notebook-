import { useEffect, useState } from 'react'
import { NOTE_COLORS } from '../constants.js'

export default function NoteEditorModal({ note, labels, onClose, onSave, onDeleteForever }) {
  const [title, setTitle] = useState(note.title || '')
  const [text, setText] = useState(note.text || '')
  const [checklist, setChecklist] = useState(note.checklist || [])
  const [color, setColor] = useState(note.color || 'paper')
  const [selectedLabels, setSelectedLabels] = useState(note.labels || [])
  const [reminderAt, setReminderAt] = useState(
    note.reminderAt ? new Date(note.reminderAt).toISOString().slice(0, 16) : ''
  )

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text, checklist, color, selectedLabels, reminderAt])

  function handleClose() {
    onSave(note.id, {
      title,
      text,
      checklist,
      color,
      labels: selectedLabels,
      reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
    })
    onClose()
  }

  function toggleLabel(id) {
    setSelectedLabels((sel) => (sel.includes(id) ? sel.filter((l) => l !== id) : [...sel, id]))
  }

  function addChecklistItem() {
    setChecklist((c) => [...c, { id: crypto.randomUUID(), text: '', done: false }])
  }

  function updateItem(idx, patch) {
    const next = [...checklist]
    next[idx] = { ...next[idx], ...patch }
    setChecklist(next)
  }

  function removeItem(idx) {
    setChecklist(checklist.filter((_, i) => i !== idx))
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-card" style={{ background: NOTE_COLORS[color] }} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}
        />

        {note.images?.length > 0 && (
          <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
            {note.images.map((src, i) => (
              <img key={i} src={src} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8 }} />
            ))}
          </div>
        )}

        <textarea
          placeholder="Note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: 14, marginTop: 10, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div style={{ marginTop: 10 }}>
          {checklist.map((item, idx) => (
            <div className="checklist-item" key={item.id}>
              <input type="checkbox" checked={item.done} onChange={(e) => updateItem(idx, { done: e.target.checked })} />
              <input
                type="text"
                value={item.text}
                onChange={(e) => updateItem(idx, { text: e.target.value })}
                style={{ border: 'none', background: 'none', outline: 'none', flex: 1, fontSize: 13.5 }}
              />
              <button className="icon-btn" onClick={() => removeItem(idx)} title="Remove item">&#10005;</button>
            </div>
          ))}
          <button className="text-btn" onClick={addChecklistItem}>+ Add item</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>Reminder</label>
          <br />
          <input
            type="datetime-local"
            value={reminderAt}
            onChange={(e) => setReminderAt(e.target.value)}
            style={{ marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid var(--rule)', fontSize: 13 }}
          />
        </div>

        {labels.length > 0 && (
          <div className="note-labels" style={{ marginTop: 14 }}>
            {labels.map((l) => (
              <button
                key={l.id}
                className="label-chip"
                style={{
                  border: 'none',
                  background: selectedLabels.includes(l.id) ? 'var(--forest)' : 'var(--paper-alt)',
                  color: selectedLabels.includes(l.id) ? 'var(--paper)' : 'var(--ink-soft)',
                }}
                onClick={() => toggleLabel(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}

        <div className="color-swatches">
          {Object.entries(NOTE_COLORS).map(([name, hex]) => (
            <button
              key={name}
              className={`swatch ${color === name ? 'selected' : ''}`}
              style={{ background: hex }}
              onClick={() => setColor(name)}
              aria-label={name}
            />
          ))}
        </div>

        <div className="composer-row">
          <button
            className="icon-btn"
            title="Delete forever"
            onClick={() => {
              onDeleteForever(note.id)
              onClose()
            }}
          >
            &#128465;
          </button>
          <button className="pill-btn" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
