import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { useDriveAuth } from '../hooks/useDriveAuth.js'
import { listFiles, createFolder, uploadFile, trashFile, downloadForTransfer, FOLDER_MIME } from '../lib/driveApi.js'
import JSZip from 'jszip'
import { transferItems } from '../lib/driveTransfer.js'
import DriveFolderIcon from './DriveFolderIcon.jsx'
import DriveAccountSwitcher from './DriveAccountSwitcher.jsx'
import DriveFolderPicker from './DriveFolderPicker.jsx'
import { IconSearch, IconClose, IconPlus, IconImage, IconGrid, IconList, IconCheck, IconCopyTo, IconMoveTo, IconTrash, IconPlay, IconPause, IconShare } from './Icons.jsx'

const DEFAULT_FOLDER_COLOR = '#8a8f99'

function formatModified(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

// Google's own embeddable preview URLs. These are explicitly designed by
// Google to be shown in an iframe (unlike a normal drive.google.com link,
// which refuses to be framed), so files open right inside the app.
//
// Two different Google products live behind these URLs, and they behave
// very differently at small widths:
//  - docs.google.com/.../preview (native Google Docs/Sheets/Slides) is an
//    embed of the actual editor UI: a fixed-width desktop canvas (~980px)
//    that is NOT responsive on its own. It needs to be rendered at that
//    native width and scaled down to fit, or text runs off the right edge.
//    Uploaded Word/PowerPoint/Excel files (.docx/.pptx/.xlsx, and their
//    legacy .doc/.ppt/.xls equivalents) go through this same non-responsive
//    Docs-style renderer when previewed — Drive converts them through the
//    editor UI, not the universal file previewer — so they need the same
//    fixed-width treatment as native Google Docs/Sheets/Slides.
//  - drive.google.com/file/d/.../preview for everything else (PDFs,
//    images, etc.) is Google's universal file previewer, which IS
//    responsive to whatever width its iframe is actually given. Forcing
//    that one into the fixed 980px canvas-then-shrink trick clips page
//    margins before our CSS ever gets a chance to scale it down.
const OFFICE_DOC_MIME = new Set([
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
// Word docs specifically get routed to the real Google Docs editor (see
// openFile below) instead of the embedded preview, since that's the only
// way to get Google's genuinely mobile-responsive rendering.
const WORD_MIME = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

// Audio/video files play in-app via a real <audio>/<video> element instead
// of Drive's /preview iframe (which has a cramped, non-native player UI and
// no playlist). Drive doesn't expose a mimeType allowlist for "media" the
// way it does for docs — any audio/* or video/* file qualifies.
function isAudioMime(mimeType) { return typeof mimeType === 'string' && mimeType.startsWith('audio/') }
function isVideoMime(mimeType) { return typeof mimeType === 'string' && mimeType.startsWith('video/') }

// Downloads the actual file bytes (not just metadata) using the Drive v3
// "alt=media" endpoint, so they can be handed to a native <audio>/<video>
// element as a blob: URL. This requires the same bearer token used for
// listing files; a 401 here means the token expired mid-session and the
// caller should refresh it via reconnect() and retry once, same pattern
// used for loadFiles below.
// Filesystem.writeFile needs binary data as base64 on native platforms
// (Blob is web-only there) — used when handing a finished zip to the
// native share sheet.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      resolve(typeof result === 'string' ? result.split(',')[1] || '' : '')
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(blob)
  })
}

async function fetchDriveMediaBlob(fileId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = new Error(`Drive media fetch failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.blob()
}
function previewUrl(file) {
  const { id, mimeType } = file
  // Note: native Google Docs (application/vnd.google-apps.document) never
  // reach this fixed-width branch in practice — openFile() intercepts them
  // earlier and routes to the real editor instead, same as Word docs. The
  // line below is kept only as a fallback in case this function is ever
  // called directly without going through that check.
  if (mimeType === 'application/vnd.google-apps.document') return { url: `https://docs.google.com/document/d/${id}/preview`, fixedWidth: true }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return { url: `https://docs.google.com/spreadsheets/d/${id}/preview`, fixedWidth: true }
  if (mimeType === 'application/vnd.google-apps.presentation') return { url: `https://docs.google.com/presentation/d/${id}/preview`, fixedWidth: true }
  if (mimeType === FOLDER_MIME) return null
  if (OFFICE_DOC_MIME.has(mimeType)) return { url: `https://drive.google.com/file/d/${id}/preview`, fixedWidth: true }
  return { url: `https://drive.google.com/file/d/${id}/preview`, fixedWidth: false }
}

function formatSize(bytes) {
  if (!bytes) return ''
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// For native Google Docs/Sheets/Slides embeds only: those render at a
// fixed desktop canvas width (~980px) and are not responsive on their own,
// which is what causes text to run off the right edge on a phone screen.
// This renders the iframe at that native width, then scales the whole
// thing down with a CSS transform to exactly match the available space,
// so the full page is visible with nothing cropped — the iframe still
// scrolls internally for content taller than one screen.
function ScaledPreviewFrame({ src, title }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const BASE_WIDTH = 980

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = size.w ? size.w / BASE_WIDTH : 1
  const frameHeight = scale ? size.h / scale : size.h

  return (
    <div className="drive-preview-frame-wrap" ref={wrapRef}>
      <iframe
        src={src}
        title={title}
        allow="autoplay"
        style={{
          width: BASE_WIDTH,
          height: frameHeight || '100%',
          border: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  )
}

// For every other file (uploaded .docx/.pdf/images, etc.) — Google's
// universal file previewer, which is genuinely responsive to whatever
// width/height its iframe is given. No canvas trick needed or wanted:
// giving it the real full-screen dimensions is what lets it lay the page
// out (and its margins) correctly in the first place.
function ResponsivePreviewFrame({ src, title }) {
  return (
    <div className="drive-preview-frame-wrap">
      <iframe
        src={src}
        title={title}
        allow="autoplay"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}

// Opens a URL as a real, top-level page rather than an iframe — a Chrome
// Custom Tab / SFSafariViewController overlay on the native app (still
// feels like part of the app, with its own close button back to Elite
// Notebook), or a new tab in the PWA/browser context. Needed for Word docs
// because Google's actual mobile-responsive Docs editor refuses to be
// framed at all (only the fixed-width /preview embed can be).
async function openInBrowser(url) {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url })
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

// Persistent bottom bar for audio playback. Stays mounted (and audio keeps
// playing) while the user browses other folders, since it's rendered
// alongside the file grid rather than inside the preview overlay. src is a
// blob: URL for the currently loaded track, or null while it's fetching.
function MiniAudioPlayer({ file, src, loading, error, hasPrev, hasNext, onPrev, onNext, onClose }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setProgress(0)
    setDuration(0)
  }, [src])

  useEffect(() => {
    if (!src) return
    const el = audioRef.current
    if (!el) return
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [src])

  function togglePlay() {
    const el = audioRef.current
    if (!el || !src) return
    if (el.paused) { el.play(); setPlaying(true) } else { el.pause(); setPlaying(false) }
  }

  function seek(e) {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setProgress(ratio * duration)
  }

  function fmt(t) {
    if (!Number.isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="media-mini-player">
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={(e) => setProgress(e.target.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          onEnded={onNext}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
      )}
      <div className="media-mini-seek" onClick={seek}>
        <div className="media-mini-seek-fill" style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }} />
      </div>
      <div className="media-mini-row">
        <div className="media-mini-info">
          <span className="media-mini-title">{file.name}</span>
          <span className="media-mini-status">
            {error ? error : loading ? 'Loading…' : duration ? `${fmt(progress)} / ${fmt(duration)}` : ''}
          </span>
        </div>
        <div className="media-mini-controls">
          <button className="media-mini-btn" onClick={onPrev} disabled={!hasPrev} aria-label="Previous track">&#8249;</button>
          <button className="media-mini-btn media-mini-play" onClick={togglePlay} disabled={!src} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <IconPause width="20" height="20" /> : <IconPlay width="20" height="20" />}
          </button>
          <button className="media-mini-btn" onClick={onNext} disabled={!hasNext} aria-label="Next track">&#8250;</button>
          <button className="media-mini-btn" onClick={onClose} aria-label="Close player">
            <IconClose width="16" height="16" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Full-screen native <video> player, same fixed-overlay shell as the
// document preview (drive-preview-full) so it feels consistent, but with a
// real <video controls> element instead of an iframe.
function VideoPlayerModal({ file, src, loading, error, hasPrev, hasNext, onPrev, onNext, onClose }) {
  return (
    <div className="drive-preview-full media-video-full">
      <div className="drive-preview-header">
        <button className="icon-toggle-btn" onClick={onClose} aria-label="Back">
          <IconClose />
        </button>
        <span className="drive-preview-title">{file.name}</span>
      </div>
      <div className="media-video-wrap">
        {src ? (
          <video className="media-video-el" src={src} controls autoPlay onEnded={onNext} />
        ) : (
          <p className="media-video-status">{error || 'Loading…'}</p>
        )}
      </div>
      {(hasPrev || hasNext) && (
        <div className="media-video-nav">
          <button onClick={onPrev} disabled={!hasPrev}>&#8249; Previous</button>
          <button onClick={onNext} disabled={!hasNext}>Next &#8250;</button>
        </div>
      )}
    </div>
  )
}

const DrivePanel = forwardRef(function DrivePanel(props, ref) {
  const {
    accounts, active, activeEmail, accessToken, connected, expired, hasAnyAccount,
    connecting, error, addAccount, reconnect, disconnect, switchAccount, tokenFor,
  } = useDriveAuth()
  const email = active?.email || null

  const [files, setFiles] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState(null)
  const [media, setMedia] = useState(null) // { queue: [file...], index, kind: 'audio' | 'video' }
  const [mediaSrc, setMediaSrc] = useState(null) // blob: URL for media.queue[media.index]
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState(null)
  const [folderStack, setFolderStack] = useState([]) // [{ id, name }], in-app folder navigation
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pendingUploads, setPendingUploads] = useState([]) // [{ id, name }] shown as spinner cards
  const [actionError, setActionError] = useState(null)
  const [actionNotice, setActionNotice] = useState(null)
  const [listView, setListView] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Map()) // id -> file object
  const [transferMode, setTransferMode] = useState(null) // 'copy' | 'move' | null
  const [sharing, setSharing] = useState(false)
  const [preparedShare, setPreparedShare] = useState(null) // { blob, name } — a finished zip waiting on a fresh tap to share
  const [driveEmailHint, setDriveEmailHint] = useState('')
  const uploadInput = useRef(null)

  const currentFolder = folderStack[folderStack.length - 1] || null

  // Hardware back button support: App.jsx asks us first (via this ref)
  // whether we have an inner layer to close — file preview, in-progress
  // new-folder form, a selection, or one level of folder navigation —
  // before it falls back to closing the whole Drive panel. Ordered
  // innermost-first, matching the visual stack (preview sits on top of
  // everything, folder depth is the outermost layer within the panel).
  useImperativeHandle(ref, () => ({
    handleBack() {
      if (previewing) { setPreviewing(null); return true }
      if (creatingFolder) { setCreatingFolder(false); setNewFolderName(''); return true }
      if (selectMode) { setSelectMode(false); setSelected(new Map()); return true }
      if (folderStack.length > 0) { setFolderStack((stack) => stack.slice(0, -1)); return true }
      return false
    },
  }))

  // Switching the active account means we're looking at a completely
  // different file tree — reset navigation and any in-progress selection.
  useEffect(() => {
    setFolderStack([])
    setSearch('')
    setSelectMode(false)
    setSelected(new Map())
  }, [activeEmail])

  async function loadFiles(token, query, parentId) {
    setLoadError(null)
    try {
      const data = await listFiles(token, { query, parentId })
      setFiles(data.files || [])
    } catch (e) {
      if (e.status === 401) {
        setFiles(null)
        const fresh = await reconnect(email, true)
        if (fresh) return loadFiles(fresh.accessToken, query, parentId)
        setLoadError('expired')
        return
      }
      setLoadError(`Could not load your Drive files: ${e.message}`)
    }
  }

  useEffect(() => {
    if (!accessToken) return
    loadFiles(accessToken, search, currentFolder?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, currentFolder])

  useEffect(() => {
    if (!accessToken) return
    const t = setTimeout(() => loadFiles(accessToken, search, currentFolder?.id), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function refreshCurrentFolder() {
    if (accessToken) loadFiles(accessToken, search, currentFolder?.id)
  }

  function openFile(f) {
    if (selectMode) {
      toggleSelect(f)
      return
    }
    if (f.mimeType === FOLDER_MIME) {
      setSearch('')
      setFolderStack((stack) => [...stack, { id: f.id, name: f.name }])
      return
    }
    if (isAudioMime(f.mimeType) || isVideoMime(f.mimeType)) {
      const kind = isAudioMime(f.mimeType) ? 'audio' : 'video'
      const test = kind === 'audio' ? isAudioMime : isVideoMime
      const queue = (files || []).filter((x) => test(x.mimeType))
      const index = Math.max(0, queue.findIndex((x) => x.id === f.id))
      setMedia({ queue, index, kind })
      return
    }
    if (WORD_MIME.has(f.mimeType) || f.mimeType === 'application/vnd.google-apps.document') {
      // The embedded /preview iframe (used for everything else) is a
      // fixed, non-responsive canvas for Word docs — same as native
      // Google Docs — and clips text at both edges once scaled down for
      // a phone screen. The real Google Docs editor IS mobile-responsive,
      // but Google won't let it be framed, so it opens as a real page
      // instead. It uses whichever Google account is already signed into
      // that browser/device, which may not be the same account connected
      // for Drive access here.
      //
      // Native Google Docs (mimeType application/vnd.google-apps.document)
      // hit this same fixed-width canvas as uploaded .docx files — if a
      // user's Drive is set to auto-convert uploads, a "Word doc" they
      // uploaded may already BE this mimeType, not the raw .docx one, so
      // it needs the same real-editor treatment.
      openInBrowser(`https://docs.google.com/document/d/${f.id}/edit`)
      return
    }
    const preview = previewUrl(f)
    if (preview) setPreviewing({ url: preview.url, name: f.name, fixedWidth: preview.fixedWidth })
    else window.open(f.webViewLink, '_blank', 'noopener')
  }

  // Loads the actual bytes for whichever track/video is current (media
  // changes on open, and again on next/prev), swapping in a fresh blob:
  // URL each time and revoking the previous one so we don't leak memory
  // across a long playlist session.
  useEffect(() => {
    if (!media) { setMediaSrc(null); setMediaError(null); return }
    let cancelled = false
    let objectUrl = null
    setMediaSrc(null)
    setMediaError(null)
    setMediaLoading(true)
    const file = media.queue[media.index]
    ;(async () => {
      try {
        let blob
        try {
          blob = await fetchDriveMediaBlob(file.id, accessToken)
        } catch (e) {
          if (e.status === 401) {
            const fresh = await reconnect(email, true)
            if (!fresh) throw e
            blob = await fetchDriveMediaBlob(file.id, fresh.accessToken)
          } else {
            throw e
          }
        }
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setMediaSrc(objectUrl)
      } catch (e) {
        if (!cancelled) setMediaError("Couldn't load this file")
      } finally {
        if (!cancelled) setMediaLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media])

  function mediaGo(delta) {
    setMedia((m) => {
      if (!m) return m
      const next = m.index + delta
      if (next < 0 || next >= m.queue.length) return m
      return { ...m, index: next }
    })
  }

  function closeMedia() {
    setMedia(null)
  }

  function goToCrumb(index) {
    // index -1 means "My Drive" (root)
    setSearch('')
    setFolderStack((stack) => stack.slice(0, index + 1))
  }

  function toggleSelect(f) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(f.id)) next.delete(f.id)
      else next.set(f.id, f)
      return next
    })
  }

  function clearSelection() {
    setSelectMode(false)
    setSelected(new Map())
  }

  async function submitNewFolder(e) {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(false)
    setNewFolderName('')
    setActionError(null)
    try {
      const folder = await createFolder(accessToken, name, currentFolder?.id)
      setFiles((list) => [folder, ...(list || [])])
    } catch (e2) {
      setActionError(`Could not create folder: ${e2.message}`)
    }
  }

  function handleUploadPick(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (!picked.length) return
    setActionError(null)
    const placeholders = picked.map((f) => ({ id: crypto.randomUUID(), name: f.name }))
    setPendingUploads((list) => [...placeholders, ...list])

    let failed = 0
    Promise.all(
      picked.map((file, i) =>
        uploadFile(accessToken, file, currentFolder?.id)
          .then((uploaded) => {
            setFiles((list) => [uploaded, ...(list || [])])
          })
          .catch(() => {
            failed++
          })
          .finally(() => {
            setPendingUploads((list) => list.filter((p) => p.id !== placeholders[i].id))
          })
      )
    ).then(() => {
      if (failed) setActionError(`${failed} file${failed > 1 ? 's' : ''} failed to upload.`)
    })
  }

  async function handleDeleteSelected() {
    const items = Array.from(selected.values())
    const ok = window.confirm(
      `Move ${items.length} item${items.length > 1 ? 's' : ''} to Drive trash? You can restore ${items.length > 1 ? 'them' : 'it'} from drive.google.com within 30 days.`
    )
    if (!ok) return

    setActionError(null)
    setActionNotice(`Deleting ${items.length} item${items.length > 1 ? 's' : ''}…`)

    let failed = 0
    for (const item of items) {
      try {
        await trashFile(accessToken, item.id)
      } catch {
        failed += 1
      }
    }

    clearSelection()
    refreshCurrentFolder()

    setActionNotice(
      failed ? `Deleted ${items.length - failed} of ${items.length} — ${failed} failed` : `Deleted ${items.length} item${items.length > 1 ? 's' : ''}`
    )
    setTimeout(() => setActionNotice(null), 6000)
  }

  // Shares the actual content of the selected files/folders — not a link.
  // Folders are walked recursively (Drive's API has no "download this
  // whole folder" endpoint), every file's real bytes are pulled down, and
  // everything is packed into a single .zip that goes out through the OS
  // share sheet as a real file attachment. Google Docs/Sheets/Slides are
  // exported to Word/Excel/PowerPoint on the way in (same as copy/move),
  // since they have no bytes of their own; anything that still can't be
  // exported is skipped and reported at the end.
  async function handleShareSelected() {
    if (sharing || selected.size === 0) return
    setSharing(true)
    setActionError(null)
    setPreparedShare(null)
    setActionNotice('Preparing files…')

    // Token can expire partway through a long folder — this mirrors the
    // 401-then-reconnect retry used elsewhere (loadFiles, media loading),
    // just wrapped so every call in the recursion benefits from it.
    let token = accessToken
    async function driveCall(fn) {
      try {
        return await fn(token)
      } catch (e) {
        if (e.status === 401) {
          const fresh = await reconnect(email, true)
          if (!fresh) throw e
          token = fresh.accessToken
          return fn(token)
        }
        throw e
      }
    }

    const skipped = []
    let done = 0

    async function addToZip(item, zipFolder) {
      if (item.mimeType === FOLDER_MIME) {
        const childZip = zipFolder.folder(item.name)
        let pageToken
        do {
          const page = await driveCall((t) => listFiles(t, { parentId: item.id, pageToken }))
          for (const child of page.files || []) {
            await addToZip(child, childZip)
          }
          pageToken = page.nextPageToken
        } while (pageToken)
        return
      }
      try {
        const payload = await driveCall((t) => downloadForTransfer(t, item))
        if (!payload) { skipped.push(item.name); return }
        zipFolder.file(payload.name, payload.blob)
        done++
        setActionNotice(`Preparing files… (${done} added)`)
      } catch {
        skipped.push(item.name)
      }
    }

    try {
      const items = Array.from(selected.values())
      const zip = new JSZip()
      for (const item of items) {
        await addToZip(item, zip)
      }

      setActionNotice('Zipping…')
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const zipName = items.length === 1 ? `${items[0].name}.zip` : 'Drive items.zip'
      const skippedNote = skipped.length ? ` — ${skipped.length} skipped (couldn't export: ${skipped.join(', ')})` : ''

      setActionNotice(`Ready to share${skippedNote}`)
      setPreparedShare({ blob: zipBlob, name: zipName })
    } catch (err) {
      setActionError("Couldn't prepare those items for sharing")
      setActionNotice(null)
    } finally {
      setSharing(false)
    }
  }

  async function shareReadyZip() {
    if (!preparedShare) return
    const { blob, name } = preparedShare
    setPreparedShare(null)

    if (Capacitor.isNativePlatform()) {
      // The browser's Web Share API only allows a fixed list of "safe"
      // file types through (images/video/audio/pdf/plain text) — a .zip
      // isn't on that list, which is why sharing one through
      // navigator.share() fails even though canShare() said yes. The
      // native Capacitor Share plugin instead calls Android/iOS's real
      // share sheet directly, the same one used for sharing a picture
      // from the Gallery/Photos app, which has no such restriction — it
      // just needs the file written to disk first so it can hand over a
      // real file:// / content:// URI instead of an in-memory blob.
      try {
        setActionNotice('Opening share sheet…')
        const base64 = await blobToBase64(blob)
        const written = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache })
        await Share.share({ files: [written.uri], title: name, dialogTitle: name })
        setActionNotice(null)
      } catch (err) {
        setActionError("Couldn't open the share sheet")
        setActionNotice(null)
      } finally {
        clearSelection()
      }
      return
    }

    // Plain browser/PWA context (no native share sheet available): try
    // the Web Share API, but its file-type allowlist means this can still
    // fail for a zip — fall back to a direct download so the content is
    // reachable either way.
    try {
      const file = new File([blob], name, { type: 'application/zip' })
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) throw new Error('unsupported')
      await navigator.share({ files: [file], title: name })
    } catch (err) {
      if (err?.name === 'AbortError') { clearSelection(); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      setActionNotice("Downloaded — this browser can't share a .zip directly")
      setTimeout(() => setActionNotice(null), 6000)
    }
    clearSelection()
  }

  function cancelPreparedShare() {
    setPreparedShare(null)
    setActionNotice(null)
  }

  async function handleTransferConfirm({ email: destEmail, folderId, folderName }) {
    const mode = transferMode
    const items = Array.from(selected.values())
    const destToken = tokenFor(destEmail)
    const sameAccount = destEmail === email

    setTransferMode(null)
    setActionError(null)
    setActionNotice(`${mode === 'copy' ? 'Copying' : 'Moving'} ${items.length} item${items.length > 1 ? 's' : ''} to ${folderName}…`)

    const result = await transferItems({
      items,
      mode,
      sourceToken: accessToken,
      destToken,
      destParentId: folderId,
      sourceParentId: currentFolder?.id,
      sameAccount,
    })

    clearSelection()
    refreshCurrentFolder()

    const bits = [`${result.succeeded} of ${result.total} ${mode === 'copy' ? 'copied' : 'moved'} to ${folderName}`]
    if (result.skipped.length) bits.push(`${result.skipped.length} skipped (unsupported file type: ${result.skipped.join(', ')})`)
    if (result.failed.length) bits.push(`${result.failed.length} failed`)
    setActionNotice(bits.join(' — '))
    setTimeout(() => setActionNotice(null), 6000)
  }

  if (!hasAnyAccount) {
    const isNative = Capacitor.isNativePlatform()
    return (
      <div className="drive-connect">
        <p>Link your Google Drive to view your files here.</p>
        {isNative ? (
          <button className="drive-connect-btn" onClick={() => addAccount()} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        ) : (
          <>
            <form
              className="drive-connect-form"
              onSubmit={(e) => { e.preventDefault(); addAccount(driveEmailHint.trim() || undefined) }}
            >
              <input
                type="email"
                className="login-input"
                placeholder="Google account email (optional)"
                autoComplete="email"
                value={driveEmailHint}
                onChange={(e) => setDriveEmailHint(e.target.value)}
                disabled={connecting}
              />
              <button className="drive-connect-btn" type="submit" disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Google Drive'}
              </button>
            </form>
            <p className="drive-connect-hint">
              Enter the Drive account's email above so Google opens straight to that account's sign-in — it can
              be different from the email you use to log into this app.
            </p>
          </>
        )}
        {error === 'missing-client-id' && (
          <p className="drive-error">
            Drive isn't set up yet — add a <code>VITE_GOOGLE_CLIENT_ID</code> environment variable (find it in
            Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration).
          </p>
        )}
        {error === 'connect-failed' && <p className="drive-error">Could not connect to Google Drive.</p>}
      </div>
    )
  }

  return (
    <div className="drive-panel">
      <div className="drive-toolbar">
        <div className="drive-search">
          <IconSearch style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search your Drive"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="drive-account">
          <button
            className={`icon-toggle-btn ${selectMode ? 'icon-toggle-btn-active' : ''}`}
            onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
            title={selectMode ? 'Cancel selection' : 'Select files'}
          >
            <IconCheck width="17" height="17" />
          </button>
          <button className="icon-toggle-btn" onClick={() => setListView((v) => !v)} title={listView ? 'Grid view' : 'List view'}>
            {listView ? <IconGrid /> : <IconList />}
          </button>
          <DriveAccountSwitcher
            accounts={accounts}
            activeEmail={activeEmail}
            onSwitch={switchAccount}
            onAddAccount={addAccount}
            onDisconnect={disconnect}
            connecting={connecting}
          />
        </div>
      </div>

      {selected.size > 0 && !preparedShare && (
        <div className="drive-selection-bar">
          <span>{selected.size} selected</span>
          <button className="pill-btn" onClick={handleShareSelected} disabled={sharing}>
            <IconShare width="15" height="15" /> Share
          </button>
          <button className="pill-btn" onClick={() => setTransferMode('copy')}>
            <IconCopyTo width="15" height="15" /> Copy to…
          </button>
          <button className="pill-btn" onClick={() => setTransferMode('move')}>
            <IconMoveTo width="15" height="15" /> Move to…
          </button>
          <button className="pill-btn pill-btn-danger" onClick={handleDeleteSelected}>
            <IconTrash width="15" height="15" /> Delete
          </button>
          <button className="text-btn" style={{ marginLeft: 'auto' }} onClick={clearSelection}>Cancel</button>
        </div>
      )}

      {preparedShare && (
        <div className="drive-selection-bar">
          <span>{formatSize(preparedShare.blob.size)} ready</span>
          <button className="pill-btn" onClick={shareReadyZip}>
            <IconShare width="15" height="15" /> Share now
          </button>
          <button className="text-btn" style={{ marginLeft: 'auto' }} onClick={cancelPreparedShare}>Cancel</button>
        </div>
      )}

      {!connected && (
        <div className="drive-connect">
          <p>{expired ? `${email}'s Drive session expired.` : `Connecting to ${email}…`}</p>
          {expired && (
            <button className="drive-connect-btn" onClick={() => reconnect(email, true)} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Reconnect'}
            </button>
          )}
        </div>
      )}

      {connected && (
        <>
          {!search && (
            <div className="drive-breadcrumbs">
              <button className={`drive-crumb ${!currentFolder ? 'active' : ''}`} onClick={() => goToCrumb(-1)}>
                My Drive
              </button>
              {folderStack.map((f, i) => (
                <span key={f.id}>
                  <span className="drive-crumb-sep">/</span>
                  <button
                    className={`drive-crumb ${i === folderStack.length - 1 ? 'active' : ''}`}
                    onClick={() => goToCrumb(i)}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {!search && (
            <div className="drive-action-bar">
              {!creatingFolder ? (
                <>
                  <button className="drive-action-btn" onClick={() => setCreatingFolder(true)}>
                    <IconPlus width="16" height="16" /> New folder
                  </button>
                  <button className="drive-action-btn" onClick={() => uploadInput.current?.click()}>
                    <IconImage width="16" height="16" /> Upload here
                  </button>
                  <input ref={uploadInput} type="file" multiple hidden onChange={handleUploadPick} />
                </>
              ) : (
                <form className="drive-new-folder-form" onSubmit={submitNewFolder}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                  <button className="pill-btn" type="submit">Create</button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => { setCreatingFolder(false); setNewFolderName('') }}
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          )}

          {actionNotice && <p className="drive-loading">{actionNotice}</p>}
          {actionError && <p className="drive-error">{actionError}</p>}

          {loadError === 'expired' && (
            <div className="drive-connect">
              <p>Your Drive session expired.</p>
              <button className="drive-connect-btn" onClick={() => reconnect(email, true)} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Reconnect Google Drive'}
              </button>
            </div>
          )}
          {loadError && loadError !== 'expired' && <p className="drive-error">{loadError}</p>}

          {files === null && !loadError && <p className="drive-loading">Loading your Drive…</p>}

          {files && files.length === 0 && pendingUploads.length === 0 && <p className="drive-loading">No files found.</p>}

          {((files && files.length > 0) || pendingUploads.length > 0) && (
            <div className={listView ? 'drive-list' : 'note-grid drive-grid'}>
              {pendingUploads.map((p) =>
                listView ? (
                  <div key={p.id} className="drive-row drive-row-uploading">
                    <span className="spinner" />
                    <div className="drive-row-text">
                      <span className="drive-row-name">{p.name}</span>
                      <span className="drive-row-meta">Uploading…</span>
                    </div>
                  </div>
                ) : (
                  <div key={p.id} className="note-card drive-card drive-card-uploading">
                    <div className="drive-card-icon-wrap">
                      <span className="spinner" />
                    </div>
                    <h3>{p.name}</h3>
                    <p className="drive-card-meta">Uploading…</p>
                  </div>
                )
              )}
              {files &&
                files.map((f) => {
                  const isFolder = f.mimeType === FOLDER_MIME
                  const folderColor = f.folderColorRgb || DEFAULT_FOLDER_COLOR
                  const isSelected = selected.has(f.id)

                  if (listView) {
                    return (
                      <button key={f.id} className={`drive-row ${isSelected ? 'drive-row-selected' : ''}`} onClick={() => openFile(f)}>
                        {selectMode && (
                          <span className={`drive-select-check ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <IconCheck width="12" height="12" />}
                          </span>
                        )}
                        {isFolder ? (
                          <DriveFolderIcon color={folderColor} size={28} />
                        ) : (
                          <img className="drive-row-icon" src={f.iconLink} alt="" loading="lazy" />
                        )}
                        <div className="drive-row-text">
                          <span className="drive-row-name">{f.name}</span>
                          <span className="drive-row-meta">
                            {isFolder ? `Modified ${formatModified(f.modifiedTime)}` : formatSize(f.size)}
                          </span>
                        </div>
                      </button>
                    )
                  }

                  return (
                    <button key={f.id} className={`note-card drive-card ${isSelected ? 'drive-card-selected' : ''}`} onClick={() => openFile(f)}>
                      {selectMode && (
                        <span className={`drive-select-check drive-select-check-card ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <IconCheck width="12" height="12" />}
                        </span>
                      )}
                      {isFolder ? (
                        <div className="drive-card-icon-wrap">
                          <DriveFolderIcon color={folderColor} size={44} />
                        </div>
                      ) : f.thumbnailLink ? (
                        <img src={f.thumbnailLink} alt="" loading="lazy" />
                      ) : (
                        <div className="drive-card-icon-wrap">
                          <img className="drive-card-icon" src={f.iconLink} alt="" loading="lazy" />
                        </div>
                      )}
                      <h3>{f.name}</h3>
                      <p className="drive-card-meta">
                        {isFolder ? `Modified ${formatModified(f.modifiedTime)}` : formatSize(f.size)}
                      </p>
                    </button>
                  )
                })}
            </div>
          )}
        </>
      )}

      {previewing && (
        <div className="drive-preview-full">
          <div className="drive-preview-header">
            <button className="icon-toggle-btn" onClick={() => setPreviewing(null)} aria-label="Back">
              <IconClose />
            </button>
            <span className="drive-preview-title">{previewing.name}</span>
          </div>
          {previewing.fixedWidth
            ? <ScaledPreviewFrame src={previewing.url} title={previewing.name} />
            : <ResponsivePreviewFrame src={previewing.url} title={previewing.name} />}
        </div>
      )}

      {media && media.kind === 'video' && (
        <VideoPlayerModal
          file={media.queue[media.index]}
          src={mediaSrc}
          loading={mediaLoading}
          error={mediaError}
          hasPrev={media.index > 0}
          hasNext={media.index < media.queue.length - 1}
          onPrev={() => mediaGo(-1)}
          onNext={() => mediaGo(1)}
          onClose={closeMedia}
        />
      )}

      {media && media.kind === 'audio' && (
        <MiniAudioPlayer
          file={media.queue[media.index]}
          src={mediaSrc}
          loading={mediaLoading}
          error={mediaError}
          hasPrev={media.index > 0}
          hasNext={media.index < media.queue.length - 1}
          onPrev={() => mediaGo(-1)}
          onNext={() => mediaGo(1)}
          onClose={closeMedia}
        />
      )}

      {transferMode && (
        <DriveFolderPicker
          accounts={accounts}
          initialEmail={email}
          tokenFor={tokenFor}
          reconnect={reconnect}
          actionLabel={transferMode === 'copy' ? 'Copy' : 'Move'}
          onCancel={() => setTransferMode(null)}
          onConfirm={handleTransferConfirm}
        />
      )}
    </div>
  )
})

export default DrivePanel
