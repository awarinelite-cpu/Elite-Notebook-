import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { IconSearch, IconClose } from './Icons.jsx'

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
const FIELDS = 'files(id,name,mimeType,iconLink,thumbnailLink,modifiedTime,webViewLink,size),nextPageToken'

// Google's own embeddable preview URLs. These are explicitly designed by
// Google to be shown in an iframe (unlike a normal drive.google.com link,
// which refuses to be framed), so files open right inside the app.
function previewUrl(file) {
  const { id, mimeType } = file
  if (mimeType === 'application/vnd.google-apps.document') return `https://docs.google.com/document/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return `https://docs.google.com/spreadsheets/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.presentation') return `https://docs.google.com/presentation/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.folder') return null
  return `https://drive.google.com/file/d/${id}/preview`
}

function formatSize(bytes) {
  if (!bytes) return ''
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function DrivePanel() {
  const { driveToken, connectDrive } = useAuth()
  const [files, setFiles] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState(null)
  const [connecting, setConnecting] = useState(false)

  async function loadFiles(token, query) {
    setError(null)
    const params = new URLSearchParams({
      pageSize: '50',
      fields: FIELDS,
      orderBy: 'modifiedTime desc',
      q: query
        ? `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`
        : 'trashed = false',
    })
    const res = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      // Token expired — ask for a fresh one and retry once.
      setFiles(null)
      const fresh = await connectDrive()
      if (fresh) return loadFiles(fresh, query)
      setError('expired')
      return
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const body = await res.json()
        detail = body?.error?.message || detail
      } catch (e) {
        // response wasn't JSON — keep the HTTP status as the detail
      }
      setError(`Could not load your Drive files: ${detail}`)
      return
    }
    const data = await res.json()
    setFiles(data.files || [])
  }

  useEffect(() => {
    if (!driveToken) return
    loadFiles(driveToken, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveToken])

  useEffect(() => {
    if (!driveToken) return
    const t = setTimeout(() => loadFiles(driveToken, search), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function handleConnect() {
    setConnecting(true)
    try {
      await connectDrive()
    } catch (e) {
      setError('Could not connect to Google Drive.')
    } finally {
      setConnecting(false)
    }
  }

  if (!driveToken) {
    return (
      <div className="drive-connect">
        <p>Link your Google Drive to view your files here.</p>
        <button className="drive-connect-btn" onClick={handleConnect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Google Drive'}
        </button>
        {error && <p className="drive-error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="drive-panel">
      <div className="drive-search">
        <IconSearch style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search your Drive"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error === 'expired' && (
        <div className="drive-connect">
          <p>Your Drive session expired.</p>
          <button className="drive-connect-btn" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Reconnect Google Drive'}
          </button>
        </div>
      )}
      {error && error !== 'expired' && <p className="drive-error">{error}</p>}

      {files === null && !error && <p className="drive-loading">Loading your Drive…</p>}

      {files && files.length === 0 && <p className="drive-loading">No files found.</p>}

      {files && files.length > 0 && (
        <div className="note-grid drive-grid">
          {files.map((f) => (
            <button
              key={f.id}
              className="note-card drive-card"
              onClick={() => {
                const url = previewUrl(f)
                if (url) setPreviewing({ url, name: f.name })
                else window.open(f.webViewLink, '_blank', 'noopener')
              }}
            >
              {f.thumbnailLink ? (
                <img src={f.thumbnailLink} alt="" loading="lazy" />
              ) : (
                <div className="drive-card-icon-wrap">
                  <img className="drive-card-icon" src={f.iconLink} alt="" loading="lazy" />
                </div>
              )}
              <h3>{f.name}</h3>
              <p className="drive-card-meta">{formatSize(f.size)}</p>
            </button>
          ))}
        </div>
      )}

      {previewing && (
        <div className="drive-preview-full">
          <div className="drive-preview-header">
            <button className="icon-toggle-btn" onClick={() => setPreviewing(null)} aria-label="Back">
              <IconClose />
            </button>
            <span className="drive-preview-title">{previewing.name}</span>
          </div>
          <iframe
            className="drive-preview-frame"
            src={previewing.url}
            title={previewing.name}
            allow="autoplay"
          />
        </div>
      )}
    </div>
  )
}
