import NoteCard from './NoteCard.jsx'
import EmptyState from './EmptyState.jsx'

export default function NoteGrid({ notes, labels, view, listView, selectMode, selectedIds, onToggleSelect, onLongPressSelect, editingNoteId, ...actions }) {
  if (notes.length === 0) {
    return <EmptyState view={view} />
  }

  const showGroups = view === 'notes'
  const pinned = showGroups ? notes.filter((n) => n.pinned) : []
  const others = showGroups ? notes.filter((n) => !n.pinned) : notes

  const gridClass = `note-grid ${listView ? 'list-view' : ''}`

  return (
    <div>
      {pinned.length > 0 && (
        <>
          <div className="section-label">Pinned</div>
          <div className={gridClass} style={{ marginBottom: 24 }}>
            {pinned.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                labels={labels}
                view={view}
                selectMode={selectMode}
                selected={selectedIds?.has(note.id)}
                onToggleSelect={onToggleSelect}
                onLongPressSelect={onLongPressSelect}
                hidden={note.id === editingNoteId}
                {...actions}
              />
            ))}
          </div>
        </>
      )}

      {pinned.length > 0 && others.length > 0 && <div className="section-label">Others</div>}

      <div className={gridClass}>
        {others.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            labels={labels}
            view={view}
            selectMode={selectMode}
            selected={selectedIds?.has(note.id)}
            onToggleSelect={onToggleSelect}
            onLongPressSelect={onLongPressSelect}
            hidden={note.id === editingNoteId}
            {...actions}
          />
        ))}
      </div>
    </div>
  )
}
