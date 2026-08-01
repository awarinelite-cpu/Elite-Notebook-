import { useState } from 'react'

export default function LabelManager({ labels, onCreate, onDelete }) {
  const [name, setName] = useState('')

  function submit(e) {
    e.preventDefault()
    onCreate(name)
    setName('')
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="New label name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--rule)', fontSize: 14 }}
        />
        <button className="pill-btn" type="submit">Create</button>
      </form>

      {labels.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No labels yet. Create one to start organizing.</p>}

      {labels.map((l) => (
        <div
          key={l.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--card)',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          <span>{l.name}</span>
          <button className="icon-btn" onClick={() => onDelete(l.id)} title="Delete label">&#128465;</button>
        </div>
      ))}
    </div>
  )
}
