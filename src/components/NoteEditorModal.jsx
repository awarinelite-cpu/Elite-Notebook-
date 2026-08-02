import { useEffect, useRef, useState } from 'react'
import { getNoteColors } from '../constants.js'
import { IconChecklist, IconImage, IconTrash, IconClose, IconEdit } from './Icons.jsx'
import ImageLightbox from './ImageLightbox.jsx'
import ImageEditor from './ImageEditor.jsx'
import { useTheme } from '../context/ThemeContext.jsx'

const BLANK = { title: '', text: '', checklist: [], color: 'default', labels: [], images: [], reminderAt: null }

// An image slot is either a finished string URL, or a placeholder object
// `{ id, previewUrl, uploading: true }` shown instantly (with a spinner)
// while the real upload is still in flight.
function srcOf(slot) {
  return typeof slot === 'string' ? slot : slot.previewUrl
}
function isUploading(slot) {
  return typeof slot !== 'string'
}

export default function NoteEditorModal({ note, initial, labels, onClose, onSave, onCreate, onDeleteForever, onUploadImage, onUploadError }) {
  const { theme } = useTheme()
  const NOTE_COLORS = getNoteColors(theme)
  const isNew = !note
  const base = note || { ...BLANK, ...(initial || {}) }

  const [title, setTitle] = useState(base.title || '')
  const [text, setText] = useState(base.text || '')
  const [checklist, setChecklist] = useState(base.checklist || [])
  const [isChecklist, setIsChecklist] = useState((base.checklist || []).length > 0)
  const [color, setColor] = useState(base.color || 'default')
  const [selectedLabels, setSelectedLabels] = useState(base.labels || [])
  const [images, setImages] = useState(base.images || [])
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [editingImage, setEditingImage] = useState(null) // index of image being edited
  const [reminderAt, setReminderAt] = useState(
    base.reminderAt ? new Date(base.reminderAt).toISOString().slice(0, 16) : ''
  )
  const fileInput = useRef(null)
  const uploading = images.some(isUploading)

  // Images picked before the modal even opened (e.g. from the FAB) upload
  // through this same placeholder pipeline, so they behave identically.
  useEffect(() => {
    if (base.pendingFiles?.length) uploadFiles(base.pendingFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildPatch() {
    return {
      title,
      text,
      checklist,
      color,
      labels: selectedLabels,
      images: images.filter((img) => typeof img === 'string'),
      reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
    }
  }

  function handleClose() {
    const patch = buildPatch()
    const isEmpty = !patch.title && !patch.text && patch.checklist.length === 0 && images.length === 0

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

  // Adds a placeholder for each file immediately (so it's visible with a
  // spinner right away), then swaps each one in place with its real URL as
  // the upload finishes — or drops it if the upload fails.
  async function uploadFiles(files) {
    const placeholders = files.map((f) => ({
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(f),
      uploading: true,
    }))
    setImages((imgs) => [...imgs, ...placeholders])

    const results = await Promise.all(
      placeholders.map((ph, i) => onUploadImage(files[i]).then((url) => ({ ph, url })))
    )

    setImages((imgs) => {
      let next = imgs
      for (const { ph, url } of results) {
        next = url
          ? next.map((slot) => (typeof slot !== 'string' && slot.id === ph.id ? url : slot))
          : next.filter((slot) => !(typeof slot !== 'string' && slot.id === ph.id))
      }
      return next
    })
    results.forEach(({ ph }) => URL.revokeObjectURL(ph.previewUrl))
    if (results.some((r) => !r.url)) onUploadError?.()
  }

  function handleFile(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    uploadFiles(files)
  }

  async function handleEditSave(blob) {
    const idx = editingImage
    const original = images[idx]
    setEditingImage(null)
    const file = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const placeholderId = crypto.randomUUID()
    setImages((imgs) =>
      imgs.map((slot, i) => (i === idx ? { id: placeholderId, previewUrl: URL.createObjectURL(file), uploading: true } : slot))
    )
    const url = await onUploadImage(file)
    setImages((imgs) => imgs.map((slot) => (typeof slot !== 'string' && slot.id === placeholderId ? (url || original) : slot)))
    if (!url) onUploadError?.()
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
            {images.map((slot, i) => {
              const pending = isUploading(slot)
              return (
                <div key={pending ? slot.id : `${slot}-${i}`} className="thumb-wrap" onClick={(e) => e.stopPropagation()}>
                  <img
                    src={srcOf(slot)}
                    alt=""
                    style={{
                      width: 96,
                      height: 96,
                      objectFit: 'cover',
                      borderRadius: 8,
                      cursor: pending ? 'default' : 'pointer',
                      opacity: pending ? 0.6 : 1,
                    }}
                    onClick={() => !pending && setLightboxIndex(i)}
                  />
                  {pending && (
                    <div className="thumb-spinner" aria-label="Uploading">
                      <span className="spinner" />
                    </div>
                  )}
                  <button
                    className="thumb-remove"
                    title="Remove image"
                    onClick={() => setImages((imgs) => imgs.filter((_, idx) => idx !== i))}
                  >
                    <IconClose width="12" height="12" />
                  </button>
                  {!pending && (
                    <button
                      className="thumb-edit"
                      title="Edit image"
                      onClick={() => setEditingImage(i)}
                    >
                      <IconEdit width="12" height="12" />
                    </button>
                  )}
                </div>
              )
            })}
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
