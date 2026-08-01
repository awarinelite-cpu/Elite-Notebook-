const COPY = {
  notes: 'Notes you add appear here',
  reminders: 'Notes with upcoming reminders appear here',
  archive: 'Archived notes appear here',
  trash: 'No notes in Trash',
}

export default function EmptyState({ view }) {
  const copy = COPY[view] || COPY.notes
  return (
    <div className="empty-state">
      <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 21h6M9.5 17h5M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" />
      </svg>
      <p>{copy}</p>
    </div>
  )
}
