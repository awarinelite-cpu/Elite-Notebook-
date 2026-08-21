import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useDriveAuth } from '../hooks/useDriveAuth.js'
import { listFiles, createFolder, uploadFile, trashFile, FOLDER_MIME } from '../lib/driveApi.js'
import { transferItems } from '../lib/driveTransfer.js'
import DriveFolderIcon from './DriveFolderIcon.jsx'
import DriveAccountSwitcher from './DriveAccountSwitcher.jsx'
import DriveFolderPicker from './DriveFolderPicker.jsx'
import { IconSearch, IconClose, IconPlus, IconImage, IconGrid, IconList, IconCheck, IconCopyTo, IconMoveTo, IconTrash } from './Icons.jsx'

const DEFAULT_FOLDER_COLOR = '#8a8f99'

function formatModified(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

// Google's own embeddable preview URLs. These are explicitly designed by
// Google to be shown in an iframe (unlike a normal drive.google.com link,
// which refuses to be framed), so files open right inside the app.
//
// Two different Google products live behind these URLs, and they behave
// very differently at small widths:
//  - docs.google.com/.../preview (native Google Docs/Sheets/Slides) is an
//    embed of the actual editor UI: a fixed-width desktop canvas (~980px)
//    that is NOT responsive on its own. It needs to be rendered at that
//    native width and scaled down to fit, or text runs off the right edge.
//  - drive.google.com/file/d/.../preview (everything else — uploaded
//    .docx/.pdf/images, i.e. every non-native file, which is most of what
//    people keep on Drive) is Google's universal file previewer, which IS
//    responsive to whatever width its iframe is actually given. Forcing
//    that one into the same fixed 980px canvas-then-shrink trick was the
//    bug: at 980px the previewer was already clipping page margins before
//    our CSS ever got a chance to scale it down, so shrinking afterwards
//    just shrank the already-cropped result.
function previewUrl(file) {
  const { id, mimeType } = file
  if (mimeType === 'application/vnd.google-apps.document') return { url: `https://docs.google.com/document/d/${id}/preview`, fixedWidth: true }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return { url: `https://docs.google.com/spreadsheets/d/${id}/preview`, fixedWidth: true }
  if (mimeType === 'application/vnd.google-apps.presentation') return { url: `https://docs.google.com/presentation/d/${id}/preview`, fixedWidth: true }
  if (mimeType === FOLDER_MIME) return null
  return { url: `https://drive.google.com/file/d/${id}/preview`, fixedWidth: false }
}

function formatSize(bytes) {
  if (!bytes) return ''
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// For native Google Docs/Sheets/Slides embeds only: those render at a
// fixed desktop canvas width (~980px) and are not responsive on their own,
// which is what causes text to run off the right edge on a phone screen.
// This renders the iframe at that native width, then scales the whole
// thing down with a CSS transform to exactly match the available space,
// so the full page is visible with nothing cropped — the iframe still
// scrolls internally for content taller than one screen.
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

// For every other file (uploaded .docx/.pdf/images, etc.) — Google's
// universal file previewer, which is genuinely responsive to whatever
// width/height its iframe is given. No canvas trick needed or wanted:
// giving it the real full-screen dimensions is what lets it lay the page
// out (and its margins) correctly in the first place.
function ResponsivePreviewFrame({ src, title }) {
  return (
    <div className="drive-preview-frame-wrap">
      <iframe
        src={src}
        title={title}
        allow="autoplay"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}

const DrivePanel = forwardRef(function DrivePanel(props, ref) {
  const {
    accounts, active, activeEmail, accessToken, connected, expired, hasAnyAccount,
    connecting, error, addAccount, reconnect, disconnect, switchAccount, tokenFor,
  } = useDriveAuth()
  const email = active?.email || null

  const [files, setFiles] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState(null)
  const [folderStack, setFolderStack] = useState([]) // [{ id, name }], in-app folder navigation
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pendingUploads, setPendingUploads] = useState([]) // [{ id, name }] shown as spinner cards
  const [actionError, setActionError] = useState(null)
  const [actionNotice, setActionNotice] = useState(null)
  const [listView, setListView] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Map()) // id -> file object
  const [transferMode, setTransferMode] = useState(null) // 'copy' | 'move' | null
  const [driveEmailHint, setDriveEmailHint] = useState('')
  const uploadInput = useRef(null)

  const currentFolder = folderStack[folderStack.length - 1] || null

  // Hardware back button support: App.jsx asks us first (via this ref)
  // whether we have an inner layer to close — file preview, in-progress
  // new-folder form, a selection, or one level of folder navigation —
  // before it falls back to closing the whole Drive panel. Ordered
  // innermost-first, matching the visual stack (preview sits on top of
  // everything, folder depth is the outermost layer within the panel).
  useImperativeHandle(ref, () => ({
    handleBack() {
      if (previewing) { setPreviewing(null); return true }
      if (creatingFolder) { setCreatingFolder(false); setNewFolderName(''); return true }
      if (selectMode) { setSelectMode(false); setSelected(new Map()); return true }
      if (folderStack.length > 0) { setFolderStack((stack) => stack.slice(0, -1)); return true }
      return false
    },
  }))

  // Switching the active account means we're looking at a completely
  // different file tree — reset navigation and any in-progress selection.
  useEffect(() => {
    setFolderStack([])
    setSearch('')
    setSelectMode(false)
    setSelected(new Map())
  }, [activeEmail])

  async function loadFiles(token, query, parentId) {
    setLoadError(null)
    try {
      const data = await listFiles(token, { query, parentId })
      setFiles(data.files || [])
    } catch (e) {
      if (e.status === 401) {
        setFiles(null)
        const fresh = await reconnect(email, true)
        if (fresh) return loadFiles(fresh.accessToken, query, parentId)
        setLoadError('expired')
        return
      }
      setLoadError(`Could not load your Drive files: ${e.message}`)
    }
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

  function refreshCurrentFolder() {
    if (accessToken) loadFiles(accessToken, search, currentFolder?.id)
  }

  function openFile(f) {
    if (selectMode) {
      toggleSelect(f)
      return
    }
    if (f.mimeType === FOLDER_MIME) {
      setSearch('')
      setFolderStack((stack) => [...stack, { id: f.id, name: f.name }])
      return
    }
    const preview = previewUrl(f)
    if (preview) setPreviewing({ url: preview.url, name: f.name, fixedWidth: preview.fixedWidth })
    else window.open(f.webViewLink, '_blank', 'noopener')
  }

  function goToCrumb(index) {
    // index -1 means "My Drive" (root)
    setSearch('')
    setFolderStack((stack) => stack.slice(0, index + 1))
  }

  function toggleSelect(f) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(f.id)) next.delete(f.id)
      else next.set(f.id, f)
      return next
    })
  }

  function clearSelection() {
    setSelectMode(false)
    setSelected(new Map())
  }

  async function submitNewFolder(e) {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(false)
    setNewFolderName('')
    setActionError(null)
    try {
      const folder = await createFolder(accessToken, name, currentFolder?.id)
      setFiles((list) => [folder, ...(list || [])])
    } catch (e2) {
      setActionError(`Could not create folder: ${e2.message}`)
    }
  }

  function handleUploadPick(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (!picked.length) return
    setActionError(null)
    const placeholders = picked.map((f) => ({ id: crypto.randomUUID(), name: f.name }))
    setPendingUploads((list) => [...placeholders, ...list])

    let failed = 0
    Promise.all(
      picked.map((file, i) =>
        uploadFile(accessToken, file, currentFolder?.id)
          .then((uploaded) => {
            setFiles((list) => [uploaded, ...(list || [])])
          })
          .catch(() => {
            failed++
          })
          .finally(() => {
            setPendingUploads((list) => list.filter((p) => p.id !== placeholders[i].id))
          })
      )
    ).then(() => {
      if (failed) setActionError(`${failed} file${failed > 1 ? 's' : ''} failed to upload.`)
    })
  }

  async function handleDeleteSelected() {
    const items = Array.from(selected.values())
    const ok = window.confirm(
      `Move ${items.length} item${items.length > 1 ? 's' : ''} to Drive trash? You can restore ${items.length > 1 ? 'them' : 'it'} from drive.google.com within 30 days.`
    )
    if (!ok) return

    setActionError(null)
    setActionNotice(`Deleting ${items.length} item${items.length > 1 ? 's' : ''}…`)

    let failed = 0
    for (const item of items) {
      try {
        await trashFile(accessToken, item.id)
      } catch {
        failed += 1
      }
    }

    clearSelection()
    refreshCurrentFolder()

    setActionNotice(
      failed ? `Deleted ${items.length - failed} of ${items.length} — ${failed} failed` : `Deleted ${items.length} item${items.length > 1 ? 's' : ''}`
    )
    setTimeout(() => setActionNotice(null), 6000)
  }

  async function handleTransferConfirm({ email: destEmail, folderId, folderName }) {
    const mode = transferMode
    const items = Array.from(selected.values())
    const destToken = tokenFor(destEmail)
    const sameAccount = destEmail === email

    setTransferMode(null)
    setActionError(null)
    setActionNotice(`${mode === 'copy' ? 'Copying' : 'Moving'} ${items.length} item${items.length > 1 ? 's' : ''} to ${folderName}…`)

    const result = await transferItems({
      items,
      mode,
      sourceToken: accessToken,
      destToken,
      destParentId: folderId,
      sourceParentId: currentFolder?.id,
      sameAccount,
    })

    clearSelection()
    refreshCurrentFolder()

    const bits = [`${result.succeeded} of ${result.total} ${mode === 'copy' ? 'copied' : 'moved'} to ${folderName}`]
    if (result.skipped.length) bits.push(`${result.skipped.length} skipped (unsupported file type: ${result.skipped.join(', ')})`)
    if (result.failed.length) bits.push(`${result.failed.length} failed`)
    setActionNotice(bits.join(' — '))
    setTimeout(() => setActionNotice(null), 6000)
  }

  if (!hasAnyAccount) {
    const isNative = Capacitor.isNativePlatform()
    return (
      <div className="drive-connect">
        <p>Link your Google Drive to view your files here.</p>
        {isNative ? (
          <button className="drive-connect-btn" onClick={() => addAccount()} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        ) : (
          <>
            <form
              className="drive-connect-form"
              onSubmit={(e) => { e.preventDefault(); addAccount(driveEmailHint.trim() || undefined) }}
            >
              <input
                type="email"
                className="login-input"
                placeholder="Google account email (optional)"
                autoComplete="email"
                value={driveEmailHint}
                onChange={(e) => setDriveEmailHint(e.target.value)}
                disabled={connecting}
              />
              <button className="drive-connect-btn" type="submit" disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Google Drive'}
              </button>
            </form>
            <p className="drive-connect-hint">
              Enter the Drive account's email above so Google opens straight to that account's sign-in — it can
              be different from the email you use to log into this app.
            </p>
          </>
        )}
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
          <button
            className={`icon-toggle-btn ${selectMode ? 'icon-toggle-btn-active' : ''}`}
            onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
            title={selectMode ? 'Cancel selection' : 'Select files'}
          >
            <IconCheck width="17" height="17" />
          </button>
          <button className="icon-toggle-btn" onClick={() => setListView((v) => !v)} title={listView ? 'Grid view' : 'List view'}>
            {listView ? <IconGrid /> : <IconList />}
          </button>
          <DriveAccountSwitcher
            accounts={accounts}
            activeEmail={activeEmail}
            onSwitch={switchAccount}
            onAddAccount={addAccount}
            onDisconnect={disconnect}
            connecting={connecting}
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="drive-selection-bar">
          <span>{selected.size} selected</span>
          <button className="pill-btn" onClick={() => setTransferMode('copy')}>
            <IconCopyTo width="15" height="15" /> Copy to…
          </button>
          <button className="pill-btn" onClick={() => setTransferMode('move')}>
            <IconMoveTo width="15" height="15" /> Move to…
          </button>
          <button className="pill-btn pill-btn-danger" onClick={handleDeleteSelected}>
            <IconTrash width="15" height="15" /> Delete
          </button>
          <button className="text-btn" style={{ marginLeft: 'auto' }} onClick={clearSelection}>Cancel</button>
        </div>
      )}

      {!connected && (
        <div className="drive-connect">
          <p>{expired ? `${email}'s Drive session expired.` : `Connecting to ${email}…`}</p>
          {expired && (
            <button className="drive-connect-btn" onClick={() => reconnect(email, true)} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Reconnect'}
            </button>
          )}
        </div>
      )}

      {connected && (
        <>
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

          {!search && (
            <div className="drive-action-bar">
              {!creatingFolder ? (
                <>
                  <button className="drive-action-btn" onClick={() => setCreatingFolder(true)}>
                    <IconPlus width="16" height="16" /> New folder
                  </button>
                  <button className="drive-action-btn" onClick={() => uploadInput.current?.click()}>
                    <IconImage width="16" height="16" /> Upload here
                  </button>
                  <input ref={uploadInput} type="file" multiple hidden onChange={handleUploadPick} />
                </>
              ) : (
                <form className="drive-new-folder-form" onSubmit={submitNewFolder}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                  <button className="pill-btn" type="submit">Create</button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => { setCreatingFolder(false); setNewFolderName('') }}
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          )}

          {actionNotice && <p className="drive-loading">{actionNotice}</p>}
          {actionError && <p className="drive-error">{actionError}</p>}

          {loadError === 'expired' && (
            <div className="drive-connect">
              <p>Your Drive session expired.</p>
              <button className="drive-connect-btn" onClick={() => reconnect(email, true)} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Reconnect Google Drive'}
              </button>
            </div>
          )}
          {loadError && loadError !== 'expired' && <p className="drive-error">{loadError}</p>}

          {files === null && !loadError && <p className="drive-loading">Loading your Drive…</p>}

          {files && files.length === 0 && pendingUploads.length === 0 && <p className="drive-loading">No files found.</p>}

          {((files && files.length > 0) || pendingUploads.length > 0) && (
            <div className={listView ? 'drive-list' : 'note-grid drive-grid'}>
              {pendingUploads.map((p) =>
                listView ? (
                  <div key={p.id} className="drive-row drive-row-uploading">
                    <span className="spinner" />
                    <div className="drive-row-text">
                      <span className="drive-row-name">{p.name}</span>
                      <span className="drive-row-meta">Uploading…</span>
                    </div>
                  </div>
                ) : (
                  <div key={p.id} className="note-card drive-card drive-card-uploading">
                    <div className="drive-card-icon-wrap">
                      <span className="spinner" />
                    </div>
                    <h3>{p.name}</h3>
                    <p className="drive-card-meta">Uploading…</p>
                  </div>
                )
              )}
              {files &&
                files.map((f) => {
                  const isFolder = f.mimeType === FOLDER_MIME
                  const folderColor = f.folderColorRgb || DEFAULT_FOLDER_COLOR
                  const isSelected = selected.has(f.id)

                  if (listView) {
                    return (
                      <button key={f.id} className={`drive-row ${isSelected ? 'drive-row-selected' : ''}`} onClick={() => openFile(f)}>
                        {selectMode && (
                          <span className={`drive-select-check ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <IconCheck width="12" height="12" />}
                          </span>
                        )}
                        {isFolder ? (
                          <DriveFolderIcon color={folderColor} size={28} />
                        ) : (
                          <img className="drive-row-icon" src={f.iconLink} alt="" loading="lazy" />
                        )}
                        <div className="drive-row-text">
                          <span className="drive-row-name">{f.name}</span>
                          <span className="drive-row-meta">
                            {isFolder ? `Modified ${formatModified(f.modifiedTime)}` : formatSize(f.size)}
                          </span>
                        </div>
                      </button>
                    )
                  }

                  return (
                    <button key={f.id} className={`note-card drive-card ${isSelected ? 'drive-card-selected' : ''}`} onClick={() => openFile(f)}>
                      {selectMode && (
                        <span className={`drive-select-check drive-select-check-card ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <IconCheck width="12" height="12" />}
                        </span>
                      )}
                      {isFolder ? (
                        <div className="drive-card-icon-wrap">
                          <DriveFolderIcon color={folderColor} size={44} />
                        </div>
                      ) : f.thumbnailLink ? (
                        <img src={f.thumbnailLink} alt="" loading="lazy" />
                      ) : (
                        <div className="drive-card-icon-wrap">
                          <img className="drive-card-icon" src={f.iconLink} alt="" loading="lazy" />
                        </div>
                      )}
                      <h3>{f.name}</h3>
                      <p className="drive-card-meta">
                        {isFolder ? `Modified ${formatModified(f.modifiedTime)}` : formatSize(f.size)}
                      </p>
                    </button>
                  )
                })}
            </div>
          )}
        </>
      )}

      {previewing && (
        <div className="drive-preview-full">
          <div className="drive-preview-header">
            <button className="icon-toggle-btn" onClick={() => setPreviewing(null)} aria-label="Back">
              <IconClose />
            </button>
            <span className="drive-preview-title">{previewing.name}</span>
          </div>
          {previewing.fixedWidth
            ? <ScaledPreviewFrame src={previewing.url} title={previewing.name} />
            : <ResponsivePreviewFrame src={previewing.url} title={previewing.name} />}
        </div>
      )}

      {transferMode && (
        <DriveFolderPicker
          accounts={accounts}
          initialEmail={email}
          tokenFor={tokenFor}
          reconnect={reconnect}
          actionLabel={transferMode === 'copy' ? 'Copy' : 'Move'}
          onCancel={() => setTransferMode(null)}
          onConfirm={handleTransferConfirm}
        />
      )}
    </div>
  )
})

export default DrivePanel
