import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import { useNotes } from './hooks/useNotes.js'
import { useLabels } from './hooks/useLabels.js'
import Login from './components/Login.jsx'
import Drawer from './components/Drawer.jsx'
import TopBar from './components/TopBar.jsx'
import NoteGrid from './components/NoteGrid.jsx'
import NoteEditorModal from './components/NoteEditorModal.jsx'
import LabelManager from './components/LabelManager.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import HelpPanel from './components/HelpPanel.jsx'
import Fab from './components/Fab.jsx'
import Toast from './components/Toast.jsx'

const PANEL_VIEWS = ['labels', 'settings', 'help']

export default function App() {
  const { user, loading } = useAuth()
  const { notes, error, createNote, updateNote, deleteNoteForever, uploadImage } = useNotes()
  const { labels, createLabel, deleteLabel } = useLabels()

  const [view, setView] = useState('notes')
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [listView, setListView] = useState(false)
  const [sortAsc, setSortAsc] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [draft, setDraft] = useState(null) // { initial } when creating, or null
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

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
    // 'drawing' and 'audio' aren't supported yet — quietly no-op
  }

  async function handlePickImage(file) {
    const url = await uploadImage(file)
    if (!url) {
      setToast("Couldn't upload that image — check Firebase Storage is set up and its rules are published.")
      return
    }
    setDraft({ images: [url] })
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
        {error && (
          <div className="error-banner">
            Couldn't reach your notes: {error} — check your Firestore rules are published.
          </div>
        )}
        {view === 'labels' && <LabelManager labels={labels} onCreate={createLabel} onDelete={deleteLabel} />}
        {view === 'settings' && <SettingsPanel />}
        {view === 'help' && <HelpPanel />}
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
