import NoteCard from './NoteCard.jsx'
import EmptyState from './EmptyState.jsx'

export default function NoteGrid({ notes, labels, view, ...actions }) {
  if (notes.length === 0) {
    return <EmptyState view={view} />
  }

  return (
    <div className="note-grid">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} labels={labels} view={view} {...actions} />
      ))}
    </div>
  )
}
