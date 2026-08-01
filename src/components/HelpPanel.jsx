export default function HelpPanel() {
  return (
    <div style={{ maxWidth: 480, fontSize: 14, lineHeight: 1.7, color: 'var(--ink)' }}>
      <p>
        <strong>Notes</strong> — tap the + button to add text, a checklist, or an image. Tap any note to
        edit it, set a color, add a label, or set a reminder.
      </p>
      <p>
        <strong>Reminders</strong> — notes with a reminder date show up here, and are highlighted once
        they're overdue.
      </p>
      <p>
        <strong>Archive &amp; Trash</strong> — archiving tucks a note out of the main view without deleting
        it. Trashed notes can be restored or removed for good.
      </p>
      <p style={{ color: 'var(--ink-soft)' }}>
        Document linking from Google Drive is planned for a future update.
      </p>
    </div>
  )
}
