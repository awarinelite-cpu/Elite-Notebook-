import { Capacitor } from '@capacitor/core'

// The @capacitor/local-notifications plugin only exists as native code on
// Android/iOS — on web it's not installed at all, so it's dynamically
// imported and only touched when we're actually running natively. That
// keeps the web/PWA bundle from trying to resolve a native-only module.
let LocalNotifications = null
async function getNativePlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (!LocalNotifications) {
    ;({ LocalNotifications } = await import('@capacitor/local-notifications'))
  }
  return LocalNotifications
}

// Android notification ids must be 32-bit ints, but note ids are Firestore
// strings — hash the string down to a stable positive int so the same note
// always maps to the same id (letting us cancel/replace its notification
// later just by id, without keeping a separate lookup table).
export function reminderNotifId(noteId) {
  let h = 0
  for (let i = 0; i < noteId.length; i++) h = (h * 31 + noteId.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}

function previewText(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  const text = (div.textContent || div.innerText || '').trim()
  return text.length > 100 ? text.slice(0, 100) + '…' : text
}

// Ask for permission. Native shows the OS prompt once and remembers the
// answer; web falls back to the standard Notification permission prompt.
export async function requestNotificationPermission() {
  const native = await getNativePlugin()
  if (native) {
    const { display } = await native.requestPermissions()
    return display === 'granted'
  }
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

// Native only: tapping a delivered reminder notification should jump the
// user straight to that note. Call once at app start with a callback that
// takes a note id.
export async function initNotificationTapHandler(onOpenNote) {
  const native = await getNativePlugin()
  if (!native) return
  native.addListener('localNotificationActionPerformed', (action) => {
    const noteId = action.notification?.extra?.noteId
    if (noteId) onOpenNote(noteId)
  })
}

// --- Web fallback -----------------------------------------------------
// There's no backend push server here, so web notifications can only fire
// while this tab/app is actually open (a real limitation vs. native OS
// scheduling — a full fix needs Firebase Cloud Messaging + a scheduled
// Cloud Function). Two things approximate the native behavior:
//  1. A timer per upcoming reminder, set while the tab is open.
//  2. A "catch-up" pass whenever the tab becomes visible again, so a
//     reminder that came due while the tab/app was closed still fires
//     the moment it's reopened, instead of silently vanishing.
// Already-fired reminders are tracked in localStorage (keyed by note id +
// reminderAt) so a catch-up pass or a re-render doesn't re-notify the same
// reminder repeatedly; a new reminderAt value on the same note is treated
// as a fresh reminder.
const webTimers = new Map()
const NOTIFIED_KEY = 'elite-notebook-notified-reminders'

function readNotified() {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}') } catch { return {} }
}
function markNotified(noteId, reminderAt) {
  const map = readNotified()
  map[noteId] = reminderAt
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map)) } catch { /* best-effort */ }
}
function alreadyNotified(noteId, reminderAt) {
  return readNotified()[noteId] === reminderAt
}

async function showWebNotification(note) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const title = note.title || 'Reminder'
  const body = previewText(note.text) || 'Open Elite Notebook to see this note'
  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `reminder-${note.id}`,
    data: { noteId: note.id },
  }
  // Showing it via the service worker registration means it still shows up
  // even if this tab isn't the focused window, and lets sw.js route the
  // click back into the app (see notificationclick in src/sw.js).
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, options)
      markNotified(note.id, note.reminderAt)
      return
    } catch { /* fall through to a plain Notification */ }
  }
  new Notification(title, options)
  markNotified(note.id, note.reminderAt)
}

// Reconciles scheduled reminders against the current note list. Call this
// whenever `notes` changes (create/edit/delete/trash/restore all flow
// through here identically since it just looks at reminderAt + trashed).
export async function syncReminders(notes) {
  const active = notes.filter((n) => n.reminderAt && !n.trashed)
  const native = await getNativePlugin()

  if (native) {
    const pending = await native.getPending()
    if (pending.notifications?.length) {
      await native.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
    }
    const future = active.filter((n) => new Date(n.reminderAt).getTime() > Date.now())
    if (future.length) {
      await native.schedule({
        notifications: future.map((n) => ({
          id: reminderNotifId(n.id),
          title: n.title || 'Reminder',
          body: previewText(n.text) || 'Open Elite Notebook to see this note',
          schedule: { at: new Date(n.reminderAt) },
          extra: { noteId: n.id },
        })),
      })
    }
    return
  }

  // Web: rebuild every timer from scratch — simplest way to stay correct
  // when a reminder's time changes or a note gets trashed/deleted.
  for (const t of webTimers.values()) clearTimeout(t)
  webTimers.clear()

  const MAX_TIMEOUT = 2_147_483_647 // setTimeout's 32-bit signed int cap (~24.8 days)
  for (const note of active) {
    const delay = new Date(note.reminderAt).getTime() - Date.now()
    if (delay > 0 && delay < MAX_TIMEOUT) {
      webTimers.set(note.id, setTimeout(() => showWebNotification(note), delay))
    } else if (delay <= 0 && !alreadyNotified(note.id, note.reminderAt)) {
      showWebNotification(note)
    }
  }
}
