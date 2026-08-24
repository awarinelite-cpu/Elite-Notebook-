import { useEffect, useState } from 'react'
import { IconClose, IconRestore } from './Icons.jsx'
import { listVersions } from '../lib/versions.js'
import { stripHtml } from '../lib/richText.js'

function formatVersionTime(ts) {
  const ms = ts?.toMillis?.()
  if (!ms) return 'Just now'
  const d = new Date(ms)
  const diffMin = Math.round((Date.now() - ms) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function previewOf(version) {
  if (version.title) return version.title
  const text = stripHtml(version.text || '').trim()
  if (text) return text.slice(0, 80)
  if (version.checklist?.length) return `${version.checklist.length} checklist item${version.checklist.length === 1 ? '' : 's'}`
  if (version.images?.length) return `${version.images.length} image${version.images.length === 1 ? '' : 's'}`
  return 'Empty note'
}

export default function VersionHistoryPanel({ noteId, onClose, onRestore }) {
  const [versions, setVersions] = useState(null) // null = loading
  const [loadError, setLoadError] = useState(false)
  const [restoring, setRestoring] = useState(null)

  useEffect(() => {
    let cancelled = false
    listVersions(noteId)
      .then((list) => { if (!cancelled) setVersions(list) })
      .catch((err) => {
        console.error('listVersions failed:', err)
        if (!cancelled) setLoadError(true)
      })
    return () => { cancelled = true }
  }, [noteId])

  async function handleRestore(version) {
    setRestoring(version.id)
    await onRestore(version)
    setRestoring(null)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card version-history-card" onClick={(e) => e.stopPropagation()}>
        <div className="version-history-header">
          <h3>Version history</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose width="18" height="18" />
          </button>
        </div>

        {versions === null && !loadError && <div className="version-history-empty">Loading…</div>}

        {loadError && (
          <div className="version-history-empty">
            Couldn't load version history right now. Try again in a moment.
          </div>
        )}

        {!loadError && versions?.length === 0 && (
          <div className="version-history-empty">
            No earlier versions yet. A checkpoint is saved automatically as you edit, so one will show up here after your next change.
          </div>
        )}

        {versions?.length > 0 && (
          <div className="version-history-list">
            {versions.map((v) => (
              <div key={v.id} className="version-history-item">
                <div className="version-history-item-main">
                  <div className="version-history-time">{formatVersionTime(v.savedAt)}</div>
                  <div className="version-history-preview">{previewOf(v)}</div>
                </div>
                <button
                  className="version-history-restore-btn"
                  disabled={restoring !== null}
                  onClick={() => handleRestore(v)}
                >
                  <IconRestore width="15" height="15" />
                  {restoring === v.id ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="version-history-footnote">Versions are kept for 24 hours.</div>
      </div>
    </div>
  )
}
