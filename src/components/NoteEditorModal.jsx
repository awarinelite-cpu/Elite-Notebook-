import { useRef, useState } from 'react'
import { NOTE_COLORS } from '../constants.js'
import { IconChecklist, IconImage, IconTrash, IconClose, IconEdit } from './Icons.jsx'
import ImageLightbox from './ImageLightbox.jsx'
import ImageEditor from './ImageEditor.jsx'

const BLANK = { title: '', text: '', checklist: [], color: 'default', labels: [], images: [], reminderAt: null }

export default function NoteEditorModal({ note, initial, labels, onClose, onSave, onCreate, onDeleteForever, onUploadImage, onUploadError }) {
  const isNew = !note
  const base = note || { ...BLANK, ...(initial || {}) }

  const [title, setTitle] = useState(base.title || '')
  const [text, setText] = useState(base.text || '')
  const [checklist, setChecklist] = useState(base.checklist || [])
  const [isChecklist, setIsChecklist] = useState((base.checklist || []).length > 0)
  const [color, setColor] = useState(base.color || 'default')
  const [selectedLabels, setSelectedLabels] = useState(base.labels || [])
  const [images, setImages] = useState(base.images || [])
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [editingImage, setEditingImage] = useState(null) // index of image being edited
  const [reminderAt, setReminderAt] = useState(
    base.reminderAt ? new Date(base.reminderAt).toISOString().slice(0, 16) : ''
  )
  const fileInput = useRef(null)

  function buildPatch() {
    return {
      title,
      text,
      checklist,
      color,
      labels: selectedLabels,
      images,
      reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
    }
  }

  function handleClose() {
    const patch = buildPatch()
    const isEmpty = !patch.title && !patch.text && patch.checklist.length === 0 && patch.images.length === 0

    if (isNew) {
      if (!isEmpty) onCreate(patch)
    } else if (!isEmpty) {
      onSave(note.id, patch)
    } else {
      onDeleteForever(note.id)
    }
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

  async function handleFile(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    const urls = await Promise.all(files.map((f) => onUploadImage(f)))
    const ok = urls.filter(Boolean)
    if (ok.length) setImages((imgs) => [...imgs, ...ok])
    if (ok.length < files.length) onUploadError?.()
    setUploading(false)
    e.target.value = ''
  }

  async function handleEditSave(blob) {
    setUploading(true)
    const file = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const url = await onUploadImage(file)
    setUploading(false)
    setEditingImage(null)
    if (url) setImages((imgs) => imgs.map((src, i) => (i === editingImage ? url : src)))
    else onUploadError?.()
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-card" style={{ background: NOTE_COLORS[color] }} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={isNew}
          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}
        />

        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
            {images.map((src, i) => (
              <div key={i} className="thumb-wrap" onClick={(e) => e.stopPropagation()}>
                <img
                  src={src}
                  alt=""
                  style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                  onClick={() => setLightboxIndex(i)}
                />
                <button
                  className="thumb-remove"
                  title="Remove image"
                  onClick={() => setImages((imgs) => imgs.filter((_, idx) => idx !== i))}
                >
                  <IconClose width="12" height="12" />
                </button>
                <button
                  className="thumb-edit"
                  title="Edit image"
                  onClick={() => setEditingImage(i)}
                >
                  <IconEdit width="12" height="12" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!isChecklist ? (
          <textarea
            placeholder="Take a note..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: 14, marginTop: 10, resize: 'vertical', fontFamily: 'inherit' }}
          />
        ) : (
          <div style={{ marginTop: 10 }}>
            {checklist.map((item, idx) => (
              <div className="checklist-item" key={item.id}>
                <input type="checkbox" checked={item.done} onChange={(e) => updateItem(idx, { done: e.target.checked })} />
                <input
                  type="text"
                  placeholder="List item"
                  value={item.text}
                  onChange={(e) => updateItem(idx, { text: e.target.value })}
                  style={{ border: 'none', background: 'none', outline: 'none', flex: 1, fontSize: 13.5 }}
                />
                <button className="icon-btn" onClick={() => removeItem(idx)} title="Remove item">&#10005;</button>
              </div>
            ))}
            <button className="text-btn" onClick={addChecklistItem}>+ Add item</button>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>Reminder</label>
          <br />
          <input
            type="datetime-local"
            value={reminderAt}
            onChange={(e) => setReminderAt(e.target.value)}
            style={{ marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)' }}
          />
        </div>

        {labels.length > 0 && (
          <div className="note-labels" style={{ marginTop: 14 }}>
            {labels.map((l) => (
              <button
                key={l.id}
                className="label-chip"
                style={{
                  background: selectedLabels.includes(l.id) ? '#1A73E8' : 'var(--surface-soft)',
                  color: selectedLabels.includes(l.id) ? '#fff' : 'var(--ink-soft)',
                  border: 'none',
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
          <button className="icon-btn" onClick={() => setIsChecklist((v) => !v)} title="Toggle checklist">
            <IconChecklist width="18" height="18" />
          </button>
          <button className="icon-btn" onClick={() => fileInput.current?.click()} title="Add image" disabled={uploading}>
            {uploading ? '...' : <IconImage width="18" height="18" />}
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={handleFile} />
          {!isNew && (
            <button className="icon-btn" title="Delete forever" onClick={() => { onDeleteForever(note.id); onClose() }}>
              <IconTrash width="18" height="18" />
            </button>
          )}
          <button className="pill-btn" style={{ marginLeft: 'auto' }} onClick={handleClose}>
            Close
          </button>
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

      {editingImage !== null && (
        <ImageEditor
          src={images[editingImage]}
          onCancel={() => setEditingImage(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}
