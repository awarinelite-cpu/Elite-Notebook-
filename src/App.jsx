import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
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
import SelectionBar from './components/SelectionBar.jsx'
import NoteGrid from './components/NoteGrid.jsx'
import NoteEditorModal from './components/NoteEditorModal.jsx'
import LabelManager from './components/LabelManager.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import HelpPanel from './components/HelpPanel.jsx'
import DrivePanel from './components/DrivePanel.jsx'
import KeepImportPanel from './components/KeepImportPanel.jsx'
import Fab from './components/Fab.jsx'
import DrawingCanvas from './components/DrawingCanvas.jsx'
import AudioRecorder from './components/AudioRecorder.jsx'
import { stripHtml } from './lib/richText.js'
import Toast from './components/Toast.jsx'
import { takePendingShare } from './shareTargetDb.js'

const PANEL_VIEWS = ['labels', 'settings', 'help', 'drive', 'keep-import']

export default function App() {
  const { user, loading } = useAuth()
  const { notes, error, syncStatus, createNote, updateNote, deleteNoteForever, uploadImage } = useNotes()
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
  const [toast, setToastRaw] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkSharing, setBulkSharing] = useState(false)
  // Whichever NoteEditorModal is currently mounted (editingNote or draft —
  // only one at a time) registers itself here so the hardware back button
  // can ask it to close an inner layer (lightbox, image editor, etc.)
  // before falling back to closing the whole note.
  const noteEditorRef = useRef(null)
  const drivePanelRef = useRef(null)
  const selectMode = selectedIds.size > 0

  // Accepts either a plain string (existing call sites) or
  // { message, actionLabel, onAction } for a toast with an Undo-style button.
  function setToast(next) {
    setToastRaw(typeof next === 'string' || next === null ? { message: next } : next)
  }

  useEffect(() => {
    if (!toast?.message) return
    const t = setTimeout(() => setToastRaw(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Hardware back button: close whatever's open one layer at a time — a
  // tool, an inner note layer (lightbox/image editor/etc.), a note itself,
  // the drawer, a selection, a search, a non-main view — and only once none
  // of that is open does it start counting as an "exit" gesture.
  //
  // Two delivery paths are wired to the same logic:
  //  - Capacitor's native 'backButton' event, for the compiled Android app.
  //  - A History API / popstate shim, for when this runs as an installed
  //    PWA (e.g. the Vercel deploy added to the home screen) where there is
  //    no Capacitor bridge and the hardware back button instead triggers
  //    ordinary browser back navigation, which would otherwise exit
  //    immediately since there's no history to go back through.
  //
  // A ref holds the latest state so neither listener needs to be torn down
  // and re-added as things change (avoiding a stale closure without
  // churning the subscription).
  const backStateRef = useRef()
  backStateRef.current = { activeTool, editingNote, draft, drawerOpen, selectMode, search, view }
  const backPressedOnceRef = useRef(false)

  // Returns true if it closed something, false if we're at the bare main
  // page and this should count toward the exit gesture instead.
  function closeTopBackLayer() {
    const s = backStateRef.current
    if (s.activeTool) { setActiveTool(null); return true }
    if (s.editingNote) {
      if (noteEditorRef.current?.handleBack()) return true
      setEditingNote(null)
      return true
    }
    if (s.draft) {
      if (noteEditorRef.current?.handleBack()) return true
      setDraft(null)
      return true
    }
    if (s.drawerOpen) { setDrawerOpen(false); return true }
    if (s.selectMode) { setSelectedIds(new Set()); return true }
    if (s.search) { setSearch(''); return true }
    if (s.view === 'drive' && drivePanelRef.current?.handleBack()) return true
    if (s.view !== 'notes') { setView('notes'); return true }
    return false
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle
    CapacitorApp.addListener('backButton', () => {
      if (closeTopBackLayer()) return

      // Truly on the bare main page: require a second press within 2s to
      // actually exit, so one stray back-tap doesn't quit the app.
      if (backPressedOnceRef.current) {
        CapacitorApp.exitApp()
      } else {
        backPressedOnceRef.current = true
        setToast('Press back again to exit')
        setTimeout(() => { backPressedOnceRef.current = false }, 2000)
      }
    }).then((h) => { handle = h })
    return () => { handle?.remove() }
  }, [])

  // PWA / plain-browser path. Modern Chrome's back-button-hijacking
  // mitigations often skip a history entry that a page pushes reactively
  // from inside a 'popstate' handler (the classic "push right back after
  // every pop" trick) — it can work once and then get silently ignored,
  // which let real back-navigation (and app exit) slip through here.
  // Instead we pre-load a batch of guard entries up front — a genuine
  // forward action, not a reaction to back — and top the batch back up
  // on a timer rather than synchronously inside the popstate handler.
  const GUARD_BATCH = 30
  const guardRemainingRef = useRef(0)
  function pushGuards(n) {
    for (let i = 0; i < n; i++) window.history.pushState({ eliteBackGuard: true }, '')
    guardRemainingRef.current += n
  }

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    pushGuards(GUARD_BATCH)

    function onPopState() {
      guardRemainingRef.current = Math.max(0, guardRemainingRef.current - 1)
      if (closeTopBackLayer()) return

      // Truly on the bare main page: require a second press within 2s to
      // actually exit, so one stray back-tap doesn't quit the app.
      if (backPressedOnceRef.current) {
        // Jump past every remaining guard entry in one go so the PWA
        // actually exits now instead of quietly eating more presses.
        window.history.go(-(guardRemainingRef.current + 1))
      } else {
        backPressedOnceRef.current = true
        setToast('Press back again to exit')
        setTimeout(() => { backPressedOnceRef.current = false }, 2000)
      }
    }
    window.addEventListener('popstate', onPopState)

    // Out-of-band top-up, deliberately not triggered from inside the
    // popstate handler — keeps the guard supply healthy without relying
    // on a pattern Chrome may choose to ignore.
    const topUp = setInterval(() => {
      if (guardRemainingRef.current < 5) pushGuards(GUARD_BATCH)
    }, 1000)

    return () => {
      window.removeEventListener('popstate', onPopState)
      clearInterval(topUp)
    }
  }, [])

  // Leaving the current view (e.g. via the drawer) exits selection mode so
  // stale selections don't linger against a different list of notes.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [view])

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
          stripHtml(n.text).toLowerCase().includes(q) ||
          n.checklist?.some((c) => c.text?.toLowerCase().includes(q)) ||
          Object.values(n.imageText || {}).some((t) => t.toLowerCase().includes(q))
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
    const wasArchived = note.archived
    updateNote(note.id, { archived: !wasArchived })
    setToast({
      message: wasArchived ? 'Unarchived' : 'Archived',
      actionLabel: 'Undo',
      onAction: () => updateNote(note.id, { archived: wasArchived }),
    })
  }
  function trash(note) {
    updateNote(note.id, { trashed: true, archived: false })
    setToast({
      message: 'Moved to trash',
      actionLabel: 'Undo',
      onAction: () => updateNote(note.id, { trashed: false, archived: note.archived }),
    })
  }
  function restore(note) {
    updateNote(note.id, { trashed: false })
    setToast({
      message: 'Restored',
      actionLabel: 'Undo',
      onAction: () => updateNote(note.id, { trashed: true }),
    })
  }
  function toggleChecklistItem(note, itemId) {
    const next = note.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c))
    updateNote(note.id, { checklist: next })
  }

  // --- Multi-select (long press on a note enters this) ---
  function enterSelectMode(note) {
    setSelectedIds(new Set([note.id]))
  }
  function toggleSelect(note) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(note.id)) next.delete(note.id)
      else next.add(note.id)
      return next
    })
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }
  function selectAllOrNone() {
    setSelectedIds((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((n) => n.id))
    )
  }

  const selectedNotes = filtered.filter((n) => selectedIds.has(n.id))
  const allSelectedPinned = selectedNotes.length > 0 && selectedNotes.every((n) => n.pinned)

  function bulkTogglePin() {
    const next = !allSelectedPinned
    selectedNotes.forEach((n) => updateNote(n.id, { pinned: next }))
    clearSelection()
  }
  function bulkArchive() {
    selectedNotes.forEach((n) => updateNote(n.id, { archived: !n.archived }))
    clearSelection()
  }
  function bulkTrash() {
    selectedNotes.forEach((n) => updateNote(n.id, { trashed: true, archived: false }))
    clearSelection()
  }
  function bulkRestore() {
    selectedNotes.forEach((n) => updateNote(n.id, { trashed: false }))
    clearSelection()
  }
  function bulkDeleteForever() {
    if (!window.confirm(`Delete ${selectedNotes.length} note${selectedNotes.length === 1 ? '' : 's'} forever? This can't be undone.`)) return
    selectedNotes.forEach((n) => deleteNoteForever(n.id))
    clearSelection()
  }
  async function bulkShare() {
    if (bulkSharing || selectedNotes.length === 0) return
    setBulkSharing(true)
    try {
      const shareText = selectedNotes
        .map((n) => {
          const parts = []
          if (n.title) parts.push(n.title)
          if (n.text) parts.push(stripHtml(n.text))
          if (n.checklist?.length) {
            parts.push(n.checklist.map((c) => `${c.done ? '\u2611' : '\u2610'} ${c.text}`).join('\n'))
          }
          return parts.join('\n')
        })
        .filter(Boolean)
        .join('\n\n---\n\n')

      // Gather up to 5 images total across the selected notes so the share
      // sheet can attach real files, not just link text.
      const allImageUrls = selectedNotes.flatMap((n) => n.images || []).slice(0, 5)
      let files = []
      if (navigator.canShare && allImageUrls.length) {
        try {
          files = await Promise.all(
            allImageUrls.map(async (url, i) => {
              const res = await fetch(url)
              const blob = await res.blob()
              return new File([blob], `image-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' })
            })
          )
        } catch {
          files = []
        }
      }

      const shareTitle = selectedNotes.length === 1 ? (selectedNotes[0].title || 'Note') : `${selectedNotes.length} notes`

      if (navigator.share) {
        if (files.length && navigator.canShare?.({ files })) {
          await navigator.share({ title: shareTitle, text: shareText, files })
        } else {
          await navigator.share({ title: shareTitle, text: shareText })
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText || shareTitle)
        setToast('Copied to clipboard')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('bulk share failed:', err)
    } finally {
      setBulkSharing(false)
    }
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

      {selectMode ? (
        <SelectionBar
          count={selectedIds.size}
          allSelected={selectedIds.size === filtered.length && filtered.length > 0}
          allPinned={allSelectedPinned}
          view={view}
          sharing={bulkSharing}
          onCancel={clearSelection}
          onSelectAll={selectAllOrNone}
          onShare={bulkShare}
          onTogglePin={bulkTogglePin}
          onArchive={bulkArchive}
          onTrash={bulkTrash}
          onRestore={bulkRestore}
          onDeleteForever={bulkDeleteForever}
        />
      ) : (
        <TopBar
          search={search}
          setSearch={setSearch}
          onMenuClick={() => setDrawerOpen(true)}
          listView={listView}
          setListView={setListView}
          sortAsc={sortAsc}
          setSortAsc={setSortAsc}
          onDriveClick={() => setView('drive')}
          syncStatus={syncStatus}
        />
      )}

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
        {view === 'drive' && <DrivePanel ref={drivePanelRef} />}
        {view === 'keep-import' && (
          <KeepImportPanel
            notes={notes}
            labels={labels}
            createNote={createNote}
            createLabel={createLabel}
            uploadImage={uploadImage}
            deleteNoteForever={deleteNoteForever}
          />
        )}
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
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onLongPressSelect={enterSelectMode}
          />
        )}
      </div>

      {view === 'notes' && !selectMode && <Fab onSelect={handleFabSelect} onPickImage={handlePickImage} />}

      {activeTool === 'drawing' && (
        <DrawingCanvas onCancel={() => setActiveTool(null)} onSave={handleDrawingSave} />
      )}
      {activeTool === 'audio' && (
        <AudioRecorder onCancel={() => setActiveTool(null)} onSave={handleAudioSave} />
      )}

      <Toast message={toast?.message} actionLabel={toast?.actionLabel} onAction={toast?.onAction} onClose={() => setToastRaw(null)} />

      {editingNote && (
        <NoteEditorModal
          ref={noteEditorRef}
          key={editingNote.id}
          note={editingNote}
          liveNote={notes.find((n) => n.id === editingNote.id) || editingNote}
          labels={labels}
          onClose={() => setEditingNote(null)}
          onSave={updateNote}
          onDeleteForever={deleteNoteForever}
          onUploadImage={uploadImage}
          onUploadError={(msg) => setToast(msg ? `Upload failed: ${msg}` : "Couldn't upload that image — check Firebase Storage is set up and its rules are published.")}
          onToast={(msg) => setToast(msg)}
        />
      )}

      {draft && (
        <NoteEditorModal
          ref={noteEditorRef}
          note={null}
          initial={draft}
          labels={labels}
          onClose={() => setDraft(null)}
          onCreate={createNote}
          onSave={updateNote}
          onDeleteForever={deleteNoteForever}
          onUploadImage={uploadImage}
          onUploadError={(msg) => setToast(msg ? `Upload failed: ${msg}` : "Couldn't upload that image — check Firebase Storage is set up and its rules are published.")}
          onToast={(msg) => setToast(msg)}
        />
      )}
    </div>
  )
}
