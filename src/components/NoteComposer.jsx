import { useRef, useState } from 'react'
import { NOTE_COLORS } from '../constants.js'

export default function NoteComposer({ onCreate, onUploadImage }) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [isChecklist, setIsChecklist] = useState(false)
  const [checklist, setChecklist] = useState([])
  const [color, setColor] = useState('paper')
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)

  function reset() {
    setExpanded(false)
    setTitle('')
    setText('')
    setIsChecklist(false)
    setChecklist([])
    setColor('paper')
    setImages([])
  }

  async function handleSave() {
    if (!title && !text && checklist.length === 0 && images.length === 0) {
      reset()
      return
    }
    await onCreate({ title, text, checklist, color, images })
    reset()
  }

  function addChecklistItem() {
    setChecklist((c) => [...c, { id: crypto.randomUUID(), text: '', done: false }])
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const url = await onUploadImage(file)
    if (url) setImages((imgs) => [...imgs, url])
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className="composer" style={{ background: NOTE_COLORS[color] }}>
      {!expanded ? (
        <input
          type="text"
          placeholder="Take a note..."
          onFocus={() => setExpanded(true)}
        />
      ) : (
        <>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          {!isChecklist ? (
            <textarea
              placeholder="Take a note..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                border: 'none',
                background: 'none',
                outline: 'none',
                fontSize: 14,
                marginTop: 8,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <div style={{ marginTop: 8 }}>
              {checklist.map((item, idx) => (
                <div className="checklist-item" key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => {
                      const next = [...checklist]
                      next[idx].done = e.target.checked
                      setChecklist(next)
                    }}
                  />
                  <input
                    type="text"
                    placeholder="List item"
                    value={item.text}
                    onChange={(e) => {
                      const next = [...checklist]
                      next[idx].text = e.target.value
                      setChecklist(next)
                    }}
                    style={{ border: 'none', background: 'none', outline: 'none', flex: 1, fontSize: 13.5 }}
                  />
                </div>
              ))}
              <button className="text-btn" onClick={addChecklistItem}>
                + Add item
              </button>
            </div>
          )}

          {images.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {images.map((src, i) => (
                <img key={i} src={src} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />
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
              &#9745;
            </button>
            <button className="icon-btn" onClick={() => fileInput.current?.click()} title="Add image" disabled={uploading}>
              {uploading ? '...' : '\u{1F5BC}'}
            </button>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={handleFile} />
            <button className="text-btn" onClick={reset}>
              Cancel
            </button>
            <button className="pill-btn" onClick={handleSave}>
              Save
            </button>
          </div>
        </>
      )}
    </div>
  )
}
