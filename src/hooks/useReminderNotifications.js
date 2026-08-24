import { useEffect, useRef } from 'react'
import {
  requestNotificationPermission,
  initNotificationTapHandler,
  syncReminders,
} from '../lib/notifications.js'

// Keeps OS-level (native) or best-effort (web) reminder notifications in
// sync with the note list, and routes a tapped notification back to its
// note. `onOpenNote` receives a note id.
export function useReminderNotifications(notes, onOpenNote) {
  const askedRef = useRef(false)
  const onOpenNoteRef = useRef(onOpenNote)
  onOpenNoteRef.current = onOpenNote

  useEffect(() => {
    initNotificationTapHandler((noteId) => onOpenNoteRef.current?.(noteId))
  }, [])

  useEffect(() => {
    if (!notes.length) return
    const hasReminder = notes.some((n) => n.reminderAt && !n.trashed)
    if (hasReminder && !askedRef.current) {
      askedRef.current = true
      requestNotificationPermission()
    }
    syncReminders(notes)
  }, [notes])

  // Web only in practice (native delivers reminders itself while closed) —
  // catches up on anything that came due while this tab was hidden/closed.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') syncReminders(notes)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [notes])
}
