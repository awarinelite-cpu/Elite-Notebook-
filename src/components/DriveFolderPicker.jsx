import { useEffect, useState } from 'react'
import { listFolders, createFolder, FOLDER_MIME } from '../lib/driveApi.js'
import DriveFolderIcon from './DriveFolderIcon.jsx'
import { IconClose, IconPlus } from './Icons.jsx'

// A focused folder browser for picking a copy/move destination. Can switch
// between any linked account (not just the one currently active in the
// main panel) since the whole point of this dialog is often to move
// something *into* a different account.
export default function DriveFolderPicker({ accounts, initialEmail, tokenFor, reconnect, actionLabel, onCancel, onConfirm }) {
  const [accountEmail, setAccountEmail] = useState(initialEmail)
  const [folderStack, setFolderStack] = useState([]) // [{id, name}]
  const [folders, setFolders] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  const currentFolder = folderStack[folderStack.length - 1] || null
  const token = tokenFor(accountEmail)

  useEffect(() => {
    setFolderStack([])
  }, [accountEmail])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setFolders(null)
    setError(null)
    listFolders(token, currentFolder?.id)
      .then((list) => { if (!cancelled) setFolders(list) })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load folders') })
    return () => { cancelled = true }
  }, [token, currentFolder])

  async function handleReconnect() {
    setReconnecting(true)
    await reconnect(accountEmail, true)
    setReconnecting(false)
  }

  async function handleCreateFolder(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !token) return
    setCreating(false)
    setNewName('')
    try {
      const folder = await createFolder(token, name, currentFolder?.id)
      setFolders((list) => [...(list || []), folder])
    } catch (e2) {
      setError(e2.message || 'Could not create folder')
    }
  }

  function confirm() {
    setBusy(true)
    onConfirm({
      email: accountEmail,
      folderId: currentFolder?.id || null,
      folderName: currentFolder?.name || 'My Drive',
    })
  }

  return (
    <div className="editor-backdrop" onClick={onCancel}>
      <div className="editor-card drive-picker-card" onClick={(e) => e.stopPropagation()}>
        <div className="drawing-header">
          <span>{actionLabel}</span>
          <button className="icon-btn" onClick={onCancel} title="Cancel">
            <IconClose width="18" height="18" />
          </button>
        </div>

        {accounts.length > 1 && (
          <div className="drive-picker-accounts">
            {accounts.map((a) => (
              <button
                key={a.email}
                className={`pill-btn ${a.email === accountEmail ? 'pill-btn-active' : ''}`}
                onClick={() => setAccountEmail(a.email)}
              >
                {a.email}
              </button>
            ))}
          </div>
        )}

        <div className="drive-breadcrumbs" style={{ padding: '0 14px' }}>
          <button className={`drive-crumb ${!currentFolder ? 'active' : ''}`} onClick={() => setFolderStack([])}>
            My Drive
          </button>
          {folderStack.map((f, i) => (
            <span key={f.id}>
              <span className="drive-crumb-sep">/</span>
              <button
                className={`drive-crumb ${i === folderStack.length - 1 ? 'active' : ''}`}
                onClick={() => setFolderStack((s) => s.slice(0, i + 1))}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>

        <div className="drive-picker-list">
          {!token && (
            <div className="drive-connect">
              <p>{accountEmail}'s session needs to reconnect.</p>
              <button className="drive-connect-btn" onClick={handleReconnect} disabled={reconnecting}>
                {reconnecting ? 'Connecting…' : 'Reconnect'}
              </button>
            </div>
          )}
          {token && error && <p className="drive-error">{error}</p>}
          {token && !error && folders === null && <p className="drive-loading">Loading folders…</p>}
          {token && !error && folders && folders.length === 0 && <p className="drive-loading">No subfolders here.</p>}
          {token && folders && folders.map((f) => (
            <button
              key={f.id}
              className="drive-row"
              onClick={() => setFolderStack((s) => [...s, { id: f.id, name: f.name }])}
            >
              <DriveFolderIcon color={f.folderColorRgb} size={26} />
              <div className="drive-row-text">
                <span className="drive-row-name">{f.name}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="editor-controls">
          {creating ? (
            <form className="drive-new-folder-form" onSubmit={handleCreateFolder}>
              <input
                type="text"
                autoFocus
                placeholder="Folder name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button className="pill-btn" type="submit">Create</button>
              <button type="button" className="text-btn" onClick={() => { setCreating(false); setNewName('') }}>
                Cancel
              </button>
            </form>
          ) : (
            <div className="editor-row">
              <button className="pill-btn" onClick={() => setCreating(true)} disabled={!token}>
                <IconPlus width="15" height="15" /> New folder
              </button>
              <button className="drive-connect-btn" style={{ marginLeft: 'auto' }} onClick={confirm} disabled={!token || busy}>
                {busy ? 'Working…' : `${actionLabel} here`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
