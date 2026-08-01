import { useRef, useState } from 'react'
import { IconImage, IconDrawing, IconAudio, IconChecklist, IconText, IconClose, IconPlus } from './Icons.jsx'

const OPTIONS = [
  { id: 'image', label: 'Image', Icon: IconImage },
  { id: 'drawing', label: 'Drawing', Icon: IconDrawing },
  { id: 'audio', label: 'Audio', Icon: IconAudio },
  { id: 'list', label: 'List', Icon: IconChecklist },
  { id: 'text', label: 'Text', Icon: IconText },
]

export default function Fab({ onSelect, onPickImage }) {
  const [open, setOpen] = useState(false)
  const fileInput = useRef(null)

  function handlePick(id) {
    setOpen(false)
    if (id === 'image') {
      fileInput.current?.click()
      return
    }
    onSelect(id)
  }

  return (
    <>
      {open && <div className="fab-backdrop" onClick={() => setOpen(false)} />}

      <div className="fab-stack">
        {open &&
          OPTIONS.map(({ id, label, Icon }) => (
            <button key={id} className="fab-option" onClick={() => handlePick(id)}>
              <Icon />
              {label}
            </button>
          ))}

        <button
          className="fab"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close' : 'New note'}
        >
          {open ? <IconClose /> : <IconPlus width="24" height="24" />}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPickImage(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
