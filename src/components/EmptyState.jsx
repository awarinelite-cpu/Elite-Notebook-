const COPY = {
  notes: { title: 'Nothing on the page yet', body: 'Write your first note above to fill it in.' },
  reminders: { title: 'No alerts set', body: 'Add a reminder to a note and it will show up here.' },
  archive: { title: 'Archive is empty', body: 'Notes you archive are kept here, out of the main view.' },
  trash: { title: 'Trash is empty', body: 'Notes you delete stay here until removed for good.' },
}

export default function EmptyState({ view }) {
  const copy = COPY[view] || COPY.notes
  return (
    <div className="empty-state">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
    </div>
  )
}
