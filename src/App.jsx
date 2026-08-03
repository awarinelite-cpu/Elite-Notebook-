import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import { useNotes } from './hooks/useNotes.js'
import { useLabels } from './hooks/useLabels.js'
import { useSecurity } from './hooks/useSecurity.js'
import { usePrefetchAttachments } from './hooks/usePrefetchAttachments.js'
import { useInstallPrompt } from './hooks/useInstallPrompt.js'
import Login from './components/Login.jsx'
import SecurityLock from './components/SecurityLock.jsx'
import Drawer from './components/Drawer.jsx'
import TopBar from './components/TopBar.jsx'
import NoteGrid from './components/NoteGrid.jsx'
import NoteEditorModal from './components/NoteEditorModal.jsx'
import LabelManager from './components/LabelManager.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import HelpPanel from './components/HelpPanel.jsx'
import DrivePanel from './components/DrivePanel.jsx'
import Fab from './components/Fab.jsx'
import DrawingCanvas from './components/DrawingCanvas.jsx'
import AudioRecorder from './components/AudioRecorder.jsx'
import Toast from './components/Toast.jsx'
import { takePendingShare } from './shareTargetDb.js'

const PANEL_VIEWS = ['labels', 'settings', 'help', 'drive']

export default function App() {
  const { user, loading } = useAuth()
  const { notes, error, createNote, updateNote, deleteNoteForever, uploadImage } = useNotes()
  const { labels, createLabel, deleteLabel } = useLabels()
  const security = useSecurity()
  usePrefetchAttachments(security.unlocked ? notes : null)
  const install = useInstallPrompt()
  const [installBannerDismissed, setInstallBannerDismissed] = useState(
    () => localStorage.getItem('install-banner-dismissed') === '1'
  )
  function dismissInstallBanner() {
    localStorage.setItem('install-banner-dismissed', '1')
    setInstallBannerDismissed(true)
  }

  const [view, setView] = useState('notes')
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [listView, setListView] = useState(false)
  const [sortAsc, setSortAsc] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [draft, setDraft] = useState(null) // { initial } when creating, or null
  const [activeTool, setActiveTool] = useState(null) // 'drawing' | 'audio' | null
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Someone shared a file/link/text to the installed app from the OS share
  // sheet. The service worker stashed it in IndexedDB and redirected here
  // with ?shared=1 — pick it up, open the editor with it attached, and
  // clean the URL so a refresh doesn't reprocess it.
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('shared')) return
    window.history.replaceState({}, '', window.location.pathname)
    ;(async () => {
      const share = await takePendingShare()
      if (!share) return
      const files = share.files || []
      const imageFiles = files.filter((f) => f.type?.startsWith('image/'))
      const docFiles = files.filter((f) => !f.type?.startsWith('image/'))
      const text = [share.text, share.url].filter(Boolean).join('\n')
      setDraft((d) => ({
        ...(d || {}),
        title: (d && d.title) || share.title || '',
        text: (d && d.text) || text,
        pendingFiles: [...((d && d.pendingFiles) || []), ...imageFiles],
        pendingDocFiles: [...((d && d.pendingDocFiles) || []), ...docFiles],
      }))
    })()
  }, [user])

  const filtered = useMemo(() => {
    let list = notes
    if (view === 'notes') list = list.filter((n) => !n.archived && !n.trashed)
    if (view === 'archive') list = list.filter((n) => n.archived && !n.trashed)
    if (view === 'trash') list = list.filter((n) => n.trashed)
    if (view === 'reminders') list = list.filter((n) => n.reminderAt && !n.trashed)

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.text?.toLowerCase().includes(q) ||
          n.checklist?.some((c) => c.text?.toLowerCase().includes(q))
      )
    }

    if (sortAsc) list = [...list].reverse()
    return list
  }, [notes, view, search, sortAsc])

  if (loading) return null
  if (!user) return <Login />
  if (security.loading) return null
  if (!security.unlocked) return <SecurityLock security={security} />

  function togglePin(note) {
    updateNote(note.id, { pinned: !note.pinned })
  }
  function toggleArchive(note) {
    updateNote(note.id, { archived: !note.archived })
  }
  function trash(note) {
    updateNote(note.id, { trashed: true, archived: false })
  }
  function restore(note) {
    updateNote(note.id, { trashed: false })
  }
  function toggleChecklistItem(note, itemId) {
    const next = note.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c))
    updateNote(note.id, { checklist: next })
  }

  function handleFabSelect(type) {
    if (type === 'text') setDraft({})
    else if (type === 'list') setDraft({ checklist: [{ id: crypto.randomUUID(), text: '', done: false }] })
    else if (type === 'drawing') setActiveTool('drawing')
    else if (type === 'audio') setActiveTool('audio')
  }

  function handlePickImage(files) {
    // Open the note editor right away with the files queued as
    // `pendingFiles` — the modal shows them instantly with a spinner and
    // uploads them itself, instead of us blocking here until they finish.
    const list = Array.isArray(files) ? files : [files]
    setDraft((d) => ({ ...(d || {}), pendingFiles: [...((d && d.pendingFiles) || []), ...list] }))
  }

  function handleDrawingSave(blob) {
    const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' })
    setActiveTool(null)
    handlePickImage([file])
  }

  function handleAudioSave(blob) {
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `voice-memo-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' })
    setActiveTool(null)
    setDraft((d) => ({ ...(d || {}), pendingAudioFiles: [...((d && d.pendingAudioFiles) || []), file] }))
  }

  return (
    <div className="app-shell">
      <Drawer open={drawerOpen} view={view} setView={setView} onClose={() => setDrawerOpen(false)} />

      <TopBar
        search={search}
        setSearch={setSearch}
        onMenuClick={() => setDrawerOpen(true)}
        listView={listView}
        setListView={setListView}
        sortAsc={sortAsc}
        setSortAsc={setSortAsc}
      />

      <div className="content">
        {!install.standalone && install.canPromptInstall && !installBannerDismissed && (
          <div className="install-banner">
            <span>Install Elite Notebook for the full app experience — works offline, opens like any other app.</span>
            <div className="install-banner-actions">
              <button onClick={install.promptInstall}>Install</button>
              <button className="install-banner-dismiss" onClick={dismissInstallBanner} aria-label="Dismiss">
                ✕
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="error-banner">
            Couldn't reach your notes: {error} — check your Firestore rules are published.
          </div>
        )}
        {view === 'labels' && <LabelManager labels={labels} onCreate={createLabel} onDelete={deleteLabel} />}
        {view === 'settings' && <SettingsPanel security={security} />}
        {view === 'help' && <HelpPanel />}
        {view === 'drive' && <DrivePanel />}
        {!PANEL_VIEWS.includes(view) && (
          <NoteGrid
            notes={filtered}
            labels={labels}
            view={view}
            listView={listView}
            onEdit={setEditingNote}
            onTogglePin={togglePin}
            onArchive={toggleArchive}
            onTrash={trash}
            onRestore={restore}
            onDeleteForever={deleteNoteForever}
            onToggleChecklistItem={toggleChecklistItem}
          />
        )}
      </div>

      {view === 'notes' && <Fab onSelect={handleFabSelect} onPickImage={handlePickImage} />}

      {activeTool === 'drawing' && (
        <DrawingCanvas onCancel={() => setActiveTool(null)} onSave={handleDrawingSave} />
      )}
      {activeTool === 'audio' && (
        <AudioRecorder onCancel={() => setActiveTool(null)} onSave={handleAudioSave} />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />

      {editingNote && (
        <NoteEditorModal
          note={editingNote}
          labels={labels}
          onClose={() => setEditingNote(null)}
          onSave={updateNote}
          onDeleteForever={deleteNoteForever}
          onUploadImage={uploadImage}
          onUploadError={() => setToast("Couldn't upload that image — check Firebase Storage is set up and its rules are published.")}
        />
      )}

      {draft && (
        <NoteEditorModal
          note={null}
          initial={draft}
          labels={labels}
          onClose={() => setDraft(null)}
          onCreate={createNote}
          onDeleteForever={deleteNoteForever}
          onUploadImage={uploadImage}
          onUploadError={() => setToast("Couldn't upload that image — check Firebase Storage is set up and its rules are published.")}
        />
      )}
    </div>
  )
}
