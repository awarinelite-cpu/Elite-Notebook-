import { useMemo, useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import { useNotes } from './hooks/useNotes.js'
import { useLabels } from './hooks/useLabels.js'
import Login from './components/Login.jsx'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import NoteComposer from './components/NoteComposer.jsx'
import NoteGrid from './components/NoteGrid.jsx'
import NoteEditorModal from './components/NoteEditorModal.jsx'
import LabelManager from './components/LabelManager.jsx'

export default function App() {
  const { user, loading } = useAuth()
  const { notes, createNote, updateNote, deleteNoteForever, uploadImage } = useNotes()
  const { labels, createLabel, deleteLabel } = useLabels()

  const [view, setView] = useState('notes')
  const [search, setSearch] = useState('')
  const [editingNote, setEditingNote] = useState(null)

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
    return list
  }, [notes, view, search])

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

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} />
      <div className="main">
        <TopBar view={view} search={search} setSearch={setSearch} />
        <div className="content">
          {view === 'notes' && <NoteComposer onCreate={createNote} onUploadImage={uploadImage} />}

          {view === 'labels' ? (
            <LabelManager labels={labels} onCreate={createLabel} onDelete={deleteLabel} />
          ) : (
            <NoteGrid
              notes={filtered}
              labels={labels}
              view={view}
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
      </div>

      {editingNote && (
        <NoteEditorModal
          note={editingNote}
          labels={labels}
          onClose={() => setEditingNote(null)}
          onSave={updateNote}
          onDeleteForever={deleteNoteForever}
        />
      )}
    </div>
  )
}
