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
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkSharing, setBulkSharing] = useState(false)
  // Whichever NoteEditorModal is currently mounted (editingNote or draft —
  // only one at a time) registers itself here so the hardware back button
  // can ask it to close an inner layer (lightbox, image editor, etc.)
  // before falling back to closing the whole note.
  const noteEditorRef = useRef(null)
  const drivePanelRef = useRef(null)
  const selectMode = selectedIds.size > 0

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
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

  // PWA / plain-browser path. We keep one extra "guard" history entry
  // pushed at all times; the hardware/gesture back button pops it and
  // fires 'popstate' instead of leaving the page. If that closed a UI
  // layer, we push the guard straight back so the next press is caught
  // too. If we were already on the bare main page, we let the pop stand
  // (and show the "press again" toast) so a genuine second press within
  // 2s has nothing left to intercept and the PWA actually exits — same
  // double-press-to-exit feel as the native path, without an artificial
  // native-only API.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    const GUARD = { eliteBackGuard: true }
    window.history.pushState(GUARD, '')
    function onPopState() {
      if (closeTopBackLayer()) {
        window.history.pushState(GUARD, '')
        return
      }
      if (!backPressedOnceRef.current) {
        backPressedOnceRef.current = true
        setToast('Press back again to exit')
        setTimeout(() => {
          backPressedOnceRef.current = false
          window.history.pushState(GUARD, '')
        }, 2000)
      }
      // else: no guard re-pushed — the next back press proceeds past this
      // page for real, which is what actually exits/minimizes the PWA.
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
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

      <Toast message={toast} onClose={() => setToast(null)} />

      {editingNote && (
        <NoteEditorModal
          ref={noteEditorRef}
          key={editingNote.id}
          note={editingNote}
          labels={labels}
          onClose={() => setEditingNote(null)}
          onSave={updateNote}
          onDeleteForever={deleteNoteForever}
          onUploadImage={uploadImage}
          onUploadError={() => setToast("Couldn't upload that image — check Firebase Storage is set up and its rules are published.")}
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
          onUploadError={() => setToast("Couldn't upload that image — check Firebase Storage is set up and its rules are published.")}
          onToast={(msg) => setToast(msg)}
        />
      )}
    </div>
  )
}
