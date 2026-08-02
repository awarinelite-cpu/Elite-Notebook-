import { useEffect, useRef, useState } from 'react'
import { useDriveAuth } from '../hooks/useDriveAuth.js'
import { IconSearch, IconClose } from './Icons.jsx'

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
const FIELDS = 'files(id,name,mimeType,iconLink,thumbnailLink,modifiedTime,webViewLink,size),nextPageToken'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

// Google's own embeddable preview URLs. These are explicitly designed by
// Google to be shown in an iframe (unlike a normal drive.google.com link,
// which refuses to be framed), so files open right inside the app.
function previewUrl(file) {
  const { id, mimeType } = file
  if (mimeType === 'application/vnd.google-apps.document') return `https://docs.google.com/document/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return `https://docs.google.com/spreadsheets/d/${id}/preview`
  if (mimeType === 'application/vnd.google-apps.presentation') return `https://docs.google.com/presentation/d/${id}/preview`
  if (mimeType === FOLDER_MIME) return null
  return `https://drive.google.com/file/d/${id}/preview`
}

function formatSize(bytes) {
  if (!bytes) return ''
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Google's Docs/Sheets/Slides/file preview iframes render at a fixed
// desktop width (~980px) and are not mobile-responsive on their own, which
// is what causes text to run off the right edge on a phone screen. This
// renders the iframe at that native width, then scales the whole thing
// down with a CSS transform to exactly match the available space, so the
// full page is visible with nothing cropped — the iframe still scrolls
// internally for content taller than one screen.
function ScaledPreviewFrame({ src, title }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const BASE_WIDTH = 980

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = size.w ? size.w / BASE_WIDTH : 1
  const frameHeight = scale ? size.h / scale : size.h

  return (
    <div className="drive-preview-frame-wrap" ref={wrapRef}>
      <iframe
        src={src}
        title={title}
        allow="autoplay"
        style={{
          width: BASE_WIDTH,
          height: frameHeight || '100%',
          border: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  )
}

export default function DrivePanel() {
  const { email, accessToken, connected, expired, connecting, error, connect, disconnect } = useDriveAuth()
  const [files, setFiles] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState(null)
  const [folderStack, setFolderStack] = useState([]) // [{ id, name }], in-app folder navigation

  const currentFolder = folderStack[folderStack.length - 1] || null

  async function loadFiles(token, query, parentId) {
    setLoadError(null)
    const clauses = ['trashed = false']
    if (query) clauses.push(`name contains '${query.replace(/'/g, "\\'")}'`)
    else if (parentId) clauses.push(`'${parentId}' in parents`)
    const params = new URLSearchParams({
      pageSize: '50',
      fields: FIELDS,
      orderBy: 'folder,modifiedTime desc',
      q: clauses.join(' and '),
    })
    const res = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      setFiles(null)
      const fresh = await connect(true)
      if (fresh) return loadFiles(fresh.accessToken, query, parentId)
      setLoadError('expired')
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
      setLoadError(`Could not load your Drive files: ${detail}`)
      return
    }
    const data = await res.json()
    setFiles(data.files || [])
  }

  useEffect(() => {
    if (!accessToken) return
    loadFiles(accessToken, search, currentFolder?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, currentFolder])

  useEffect(() => {
    if (!accessToken) return
    const t = setTimeout(() => loadFiles(accessToken, search, currentFolder?.id), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function openFile(f) {
    if (f.mimeType === FOLDER_MIME) {
      setSearch('')
      setFolderStack((stack) => [...stack, { id: f.id, name: f.name }])
      return
    }
    const url = previewUrl(f)
    if (url) setPreviewing({ url, name: f.name })
    else window.open(f.webViewLink, '_blank', 'noopener')
  }

  function goToCrumb(index) {
    // index -1 means "My Drive" (root)
    setFolderStack((stack) => stack.slice(0, index + 1))
  }

  if (!connected) {
    return (
      <div className="drive-connect">
        {expired ? <p>Your Drive session expired.</p> : <p>Link your Google Drive to view your files here.</p>}
        <button className="drive-connect-btn" onClick={() => connect(true)} disabled={connecting}>
          {connecting ? 'Connecting…' : expired ? 'Reconnect Google Drive' : 'Connect Google Drive'}
        </button>
        {error === 'missing-client-id' && (
          <p className="drive-error">
            Drive isn't set up yet — add a <code>VITE_GOOGLE_CLIENT_ID</code> environment variable (find it in
            Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration).
          </p>
        )}
        {error === 'connect-failed' && <p className="drive-error">Could not connect to Google Drive.</p>}
      </div>
    )
  }

  return (
    <div className="drive-panel">
      <div className="drive-toolbar">
        <div className="drive-search">
          <IconSearch style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search your Drive"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="drive-account">
          <span className="drive-account-email" title={email || ''}>{email}</span>
          <button className="text-btn" onClick={disconnect}>Disconnect</button>
        </div>
      </div>

      {!search && (
        <div className="drive-breadcrumbs">
          <button className={`drive-crumb ${!currentFolder ? 'active' : ''}`} onClick={() => goToCrumb(-1)}>
            My Drive
          </button>
          {folderStack.map((f, i) => (
            <span key={f.id}>
              <span className="drive-crumb-sep">/</span>
              <button
                className={`drive-crumb ${i === folderStack.length - 1 ? 'active' : ''}`}
                onClick={() => goToCrumb(i)}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {loadError === 'expired' && (
        <div className="drive-connect">
          <p>Your Drive session expired.</p>
          <button className="drive-connect-btn" onClick={() => connect(true)} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Reconnect Google Drive'}
          </button>
        </div>
      )}
      {loadError && loadError !== 'expired' && <p className="drive-error">{loadError}</p>}

      {files === null && !loadError && <p className="drive-loading">Loading your Drive…</p>}

      {files && files.length === 0 && <p className="drive-loading">No files found.</p>}

      {files && files.length > 0 && (
        <div className="note-grid drive-grid">
          {files.map((f) => (
            <button key={f.id} className="note-card drive-card" onClick={() => openFile(f)}>
              {f.thumbnailLink ? (
                <img src={f.thumbnailLink} alt="" loading="lazy" />
              ) : (
                <div className="drive-card-icon-wrap">
                  <img className="drive-card-icon" src={f.iconLink} alt="" loading="lazy" />
                </div>
              )}
              <h3>{f.name}</h3>
              <p className="drive-card-meta">{f.mimeType === FOLDER_MIME ? 'Folder' : formatSize(f.size)}</p>
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
          <ScaledPreviewFrame src={previewing.url} title={previewing.name} />
        </div>
      )}
    </div>
  )
}
