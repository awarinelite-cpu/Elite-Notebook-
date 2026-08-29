import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import jsPDF from 'jspdf'
import { getNoteColors, NOTE_BACKGROUNDS, NOTE_BACKGROUND_LABELS } from '../constants.js'
import { IconChecklist, IconImage, IconTrash, IconClose, IconDrawing, IconMic, IconAttachment, IconFileDoc, IconScan, IconBack, IconPin, IconUnpin, IconBell, IconArchive, IconWallpaper, IconMoreVert, IconBold, IconItalic, IconUnderline, IconBulletList, IconNumberedList, IconUndo, IconRedo, IconCheck, IconShare, IconRestore } from './Icons.jsx'
import ImageLightbox from './ImageLightbox.jsx'
import ImageEditor from './ImageEditor.jsx'
import DrawingCanvas from './DrawingCanvas.jsx'
import DocumentScanner from './DocumentScanner.jsx'
import AudioRecorder from './AudioRecorder.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { extractTextFromImages } from '../lib/ocr.js'
import { saveVersionIfChanged, snapshotOf } from '../lib/versions.js'
import { linkifyHtml } from '../lib/linkify.js'
import VersionHistoryPanel from './VersionHistoryPanel.jsx'

const BLANK = { title: '', text: '', checklist: [], color: 'default', background: 'none', labels: [], images: [], audio: [], files: [], reminderAt: null, pinned: false, archived: false }

// An image slot is either a finished string URL, or a placeholder object
// `{ id, previewUrl, uploading: true }` shown instantly (with a spinner)
// while the real upload is still in flight.
function srcOf(slot) {
  return typeof slot === 'string' ? slot : slot.previewUrl
}
function isUploading(slot) {
  return typeof slot !== 'string'
}
function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const NoteEditorModal = forwardRef(function NoteEditorModal({ note, liveNote, initial, labels, onClose, onSave, onCreate, onDeleteForever, onUploadImage, onUploadError, onToast }, ref) {
  const { theme } = useTheme()
  const NOTE_COLORS = getNoteColors(theme)
  const isNew = !note
  const base = note || { ...BLANK, ...(initial || {}) }

  const [title, setTitle] = useState(base.title || '')
  const [text, setText] = useState(base.text || '')
  const [checklist, setChecklist] = useState(base.checklist || [])
  const [isChecklist, setIsChecklist] = useState((base.checklist || []).length > 0)
  const [color, setColor] = useState(base.color || 'default')
  const [background, setBackground] = useState(base.background || 'none')
  const [selectedLabels, setSelectedLabels] = useState(base.labels || [])
  const [images, setImages] = useState(base.images || [])
  // Text OCR has pulled out of each image, keyed by the image's final
  // Storage URL. Persisted on the note as `imageText` so search can match
  // words that only appear inside a photo (an exam number, a drug label).
  const [ocrText, setOcrText] = useState(base.imageText || {})
  const [audioClips, setAudioClips] = useState(base.audio || [])
  const [attachments, setAttachments] = useState(base.files || [])
  const [subTool, setSubTool] = useState(null) // 'drawing' | 'audio' | 'scan' | null
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [editingImage, setEditingImage] = useState(null) // index of image being edited
  // Long-press image selection, scoped to this open note (mirrors the
  // grid's long-press-to-select pattern, one level down at the image level).
  const [imageSelection, setImageSelection] = useState(() => new Set())
  const imageSelectMode = imageSelection.size > 0
  const [sharingImages, setSharingImages] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const imgLongPressTimer = useRef(null)
  const imgLongPressFired = useRef(null) // index the long press fired for, or null
  const imgTouchStartPos = useRef({ x: 0, y: 0 })
  const IMG_LONG_PRESS_MS = 450
  const IMG_MOVE_TOLERANCE = 10
  // Hardware back button support: App.jsx owns the global 'backButton'
  // listener and, whenever a note is open, asks us first (via this ref)
  // whether we have an inner layer to close — image editor, drawing/audio
  // sub-tool, lightbox, image-selection, share menu, more-menu — before it
  // falls back to closing the whole note. Ordered innermost-first.
  useImperativeHandle(ref, () => ({
    handleBack() {
      if (showHistory) { setShowHistory(false); return true }
      if (editingImage !== null) { setEditingImage(null); return true }
      if (subTool) { setSubTool(null); return true }
      if (lightboxIndex !== null) { setLightboxIndex(null); return true }
      if (imageSelectMode) { setImageSelection(new Set()); return true }
      if (showShareMenu) { setShowShareMenu(false); return true }
      if (showMoreMenu) { setShowMoreMenu(false); return true }
      return false
    },
  }))

  const [reminderAt, setReminderAt] = useState(
    base.reminderAt ? new Date(base.reminderAt).toISOString().slice(0, 16) : ''
  )
  const [pinned, setPinned] = useState(!!base.pinned)
  const [archived, setArchived] = useState(!!base.archived)
  const [showReminder, setShowReminder] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const currentId = note?.id || createdId
  const skipFirstAutosave = useRef(true)
  const creatingRef = useRef(false)
  const [showHistory, setShowHistory] = useState(false)
  // Version-history bookkeeping: sessionBaselineRef holds the content as of
  // the last checkpoint (starts as the note's state when the editor opened),
  // and a checkpoint is only written to Firestore once per session, then
  // again at most every 10 minutes for a session that stays open a long
  // time — not on every 600ms autosave tick, which would spam a version
  // per pause-to-think while typing.
  const sessionBaselineRef = useRef(!isNew ? snapshotOf(base) : null)
  const lastVersionSavedAtRef = useRef(0)
  const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000

  // Cross-device conflict detection: lastSentPatchRef holds the content this
  // session most recently wrote. When liveNote (kept fresh by the parent's
  // Firestore listener) changes to something that ISN'T just the echo of
  // our own save, another device edited this note while it was open here.
  const lastSentPatchRef = useRef(null)
  const [conflict, setConflict] = useState(null)
  const fileInput = useRef(null)
  const docInput = useRef(null)
  const textEditorRef = useRef(null)
  const modalCardRef = useRef(null)
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, ul: false, ol: false })
  const uploading = images.some(isUploading)
  const audioUploading = audioClips.some(isUploading)
  const docsUploading = attachments.some((a) => a.uploading)

  // Images, audio, and documents picked before the modal even opened — e.g.
  // from the FAB, or from the OS share sheet — upload through this same
  // placeholder pipeline, so they behave identically to ones added from
  // inside the editor.
  useEffect(() => {
    if (base.pendingFiles?.length) uploadFiles(base.pendingFiles)
    if (base.pendingAudioFiles?.length) uploadAudioClips(base.pendingAudioFiles)
    if (base.pendingDocFiles?.length) uploadAttachments(base.pendingDocFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The editable text area is uncontrolled after this - its own onInput keeps
  // `text` in sync - so the caret never jumps mid-typing the way it would if
  // React re-set innerHTML on every keystroke.
  useEffect(() => {
    if (textEditorRef.current) textEditorRef.current.innerHTML = linkifyHtml(base.text || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildPatch() {
    return {
      title,
      text,
      checklist,
      color,
      background,
      labels: selectedLabels,
      images: images.filter((img) => typeof img === 'string'),
      // Filtered against the current image list so a removed/replaced
      // image's leftover OCR text never lingers in the saved note.
      imageText: Object.fromEntries(
        Object.entries(ocrText).filter(([url]) => images.includes(url))
      ),
      audio: audioClips.filter((clip) => typeof clip === 'string'),
      files: attachments.filter((a) => !a.uploading).map((a) => ({ url: a.url, name: a.name, size: a.size, type: a.type })),
      reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
      pinned,
      archived,
    }
  }

  function isPatchEmpty(patch) {
    return (
      !patch.title && !patch.text && patch.checklist.length === 0 &&
      images.length === 0 && audioClips.length === 0 && attachments.length === 0
    )
  }

  // Writes a version checkpoint (the content as it was before this session's
  // edits) the first time this session actually changes something, and at
  // most once every CHECKPOINT_INTERVAL_MS after that for long sessions —
  // not on every autosave tick.
  async function maybeCheckpointVersion(patch) {
    if (isNew || !currentId || !sessionBaselineRef.current) return
    const now = Date.now()
    if (lastVersionSavedAtRef.current && now - lastVersionSavedAtRef.current < CHECKPOINT_INTERVAL_MS) return
    const baseline = sessionBaselineRef.current
    await saveVersionIfChanged(currentId, baseline, patch)
    sessionBaselineRef.current = patch
    lastVersionSavedAtRef.current = now
  }

  // Cross-device conflict detection: liveNote is kept fresh by the parent
  // from its Firestore listener even while this editor stays open. If its
  // content changes to something other than the echo of our own last save,
  // another device edited this note concurrently.
  useEffect(() => {
    if (isNew || !currentId || !liveNote || liveNote.id !== currentId) return
    const liveSnap = snapshotOf(liveNote)
    const expectedSnap = lastSentPatchRef.current ? snapshotOf(lastSentPatchRef.current) : snapshotOf(base)
    if (JSON.stringify(liveSnap) !== JSON.stringify(expectedSnap)) {
      setConflict(liveNote)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveNote])

  function acceptRemoteVersion() {
    const remote = conflict
    setConflict(null)
    if (!remote) return
    setTitle(remote.title || '')
    setText(remote.text || '')
    setChecklist(remote.checklist || [])
    setIsChecklist((remote.checklist || []).length > 0)
    setImages(remote.images || [])
    setAudioClips(remote.audio || [])
    setAttachments(remote.files || [])
    const snap = snapshotOf(remote)
    sessionBaselineRef.current = snap
    lastSentPatchRef.current = snap
  }

  function keepLocalVersion() {
    // Not a real merge — just dismiss. The next autosave (of whatever's on
    // screen here) overwrites the remote change; the effect above only
    // re-fires if liveNote changes again, so this won't nag repeatedly for
    // the same conflict.
    setConflict(null)
  }

  // Autosave: any change to the note's content persists a few hundred ms
  // after the user stops typing, so leaving the editor (backdrop click, back
  // button, switching apps) never loses an edit. A brand-new note only gets
  // created once it actually has content; every autosave after that updates
  // the same document via `currentId` instead of creating duplicates.
  useEffect(() => {
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false
      return
    }
    const patch = buildPatch()
    if (isPatchEmpty(patch)) return

    const t = setTimeout(async () => {
      if (currentId) {
        onSave(currentId, patch)
        lastSentPatchRef.current = patch
        maybeCheckpointVersion(patch)
      } else if (isNew && !creatingRef.current) {
        creatingRef.current = true
        const id = await onCreate(patch)
        creatingRef.current = false
        if (id) setCreatedId(id)
      }
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text, checklist, color, background, selectedLabels, images, ocrText, audioClips, attachments, reminderAt, pinned, archived])

  // Keep whatever field the person just tapped into visible once the
  // on-screen keyboard opens. The native Keyboard plugin (resize: 'body')
  // shrinks the viewport so the modal's own scroll area can reach the
  // field at all, but the keyboard's show animation still takes a beat to
  // settle — this nudges the focused field into view shortly after focus
  // instead of leaving it to whatever position it happened to be in
  // before the keyboard opened. A single delegated listener covers the
  // title input, the rich-text body, and every checklist row without
  // needing a handler wired to each one individually.
  useEffect(() => {
    const container = modalCardRef.current
    if (!container) return
    function handleFocusIn(e) {
      const target = e.target
      if (!target.matches?.('input, textarea, [contenteditable="true"]')) return
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
    container.addEventListener('focusin', handleFocusIn)
    return () => container.removeEventListener('focusin', handleFocusIn)
  }, [])

  function handleClose() {
    const patch = buildPatch()
    const isEmpty = isPatchEmpty(patch)

    if (currentId) {
      if (isEmpty) onDeleteForever(currentId)
      else onSave(currentId, patch)
    } else if (!isEmpty && !creatingRef.current) {
      onCreate(patch)
    }
    onClose()
  }

  function toggleLabel(id) {
    setSelectedLabels((sel) => (sel.includes(id) ? sel.filter((l) => l !== id) : [...sel, id]))
  }

  function addChecklistItem() {
    setChecklist((c) => [...c, { id: crypto.randomUUID(), text: '', done: false }])
  }

  function updateItem(idx, patch) {
    const next = [...checklist]
    next[idx] = { ...next[idx], ...patch }
    setChecklist(next)
  }

  function removeItem(idx) {
    setChecklist(checklist.filter((_, i) => i !== idx))
  }

  // Reflects the current selection's formatting on the toolbar buttons
  // (e.g. the Bold button lights up while the cursor sits in bold text).
  function refreshActiveFormats() {
    if (!document.queryCommandState) return
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
    })
  }

  // Word-style formatting toolbar: bold/italic/underline/lists via the
  // browser's built-in rich-text editing commands. onMouseDown (rather than
  // onClick) with preventDefault keeps the text selection intact so the
  // command applies to what's highlighted instead of losing focus first.
  function applyFormat(command) {
    textEditorRef.current?.focus()
    document.execCommand(command, false, null)
    setText(textEditorRef.current?.innerHTML || '')
    refreshActiveFormats()
  }

  function handleTextInput(e) {
    setText(e.currentTarget.innerHTML)
  }

  // Runs once typing stops (focus leaves the note body) rather than on
  // every keystroke — rewriting DOM nodes while the caret is mid-word would
  // fight the browser's own cursor placement. By blur time nothing is
  // being typed into, so replacing the raw URL text with an <a> is safe.
  function handleTextBlur() {
    if (!textEditorRef.current) return
    const linked = linkifyHtml(textEditorRef.current.innerHTML)
    if (linked !== textEditorRef.current.innerHTML) {
      textEditorRef.current.innerHTML = linked
      setText(linked)
    }
  }

  function undoRedo(command) {
    textEditorRef.current?.focus()
    document.execCommand(command, false, null)
    setText(textEditorRef.current?.innerHTML || '')
    refreshActiveFormats()
  }

  // Adds a placeholder for each file immediately (so it's visible with a
  // spinner right away), then swaps each one in place with its real URL as
  // the upload finishes — or drops it if the upload fails.
  async function uploadFiles(files) {
    const placeholders = files.map((f) => ({
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(f),
      uploading: true,
    }))
    setImages((imgs) => [...imgs, ...placeholders])

    const results = await Promise.all(
      placeholders.map((ph, i) => onUploadImage(files[i]).then((res) => ({ ph, url: res.url, error: res.error })))
    )

    setImages((imgs) => {
      let next = imgs
      for (const { ph, url } of results) {
        next = url
          ? next.map((slot) => (typeof slot !== 'string' && slot.id === ph.id ? url : slot))
          : next.filter((slot) => !(typeof slot !== 'string' && slot.id === ph.id))
      }
      return next
    })
    results.forEach(({ ph }) => URL.revokeObjectURL(ph.previewUrl))
    const failed = results.find((r) => !r.url)
    if (failed) onUploadError?.(failed.error)

    // OCR runs in the background against the original files (avoids a
    // re-download of what was just uploaded) and is intentionally not
    // awaited — extracted text lands in search a few seconds after the
    // image itself does, rather than making the person wait on it.
    const succeeded = results.filter((r) => r.url)
    if (succeeded.length) {
      extractTextFromImages(
        succeeded.map((r) => files[placeholders.indexOf(r.ph)]),
        (idx, text) => {
          if (!text) return
          const url = succeeded[idx].url
          setOcrText((prev) => ({ ...prev, [url]: text }))
        }
      )
    }
  }

  function handleFile(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    uploadFiles(files)
  }

  // Same placeholder-then-swap pipeline as uploadFiles, for voice memos.
  async function uploadAudioClips(files) {
    const placeholders = files.map((f) => ({
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(f),
      uploading: true,
    }))
    setAudioClips((clips) => [...clips, ...placeholders])

    const results = await Promise.all(
      placeholders.map((ph, i) => onUploadImage(files[i]).then((res) => ({ ph, url: res.url, error: res.error })))
    )

    setAudioClips((clips) => {
      let next = clips
      for (const { ph, url } of results) {
        next = url
          ? next.map((slot) => (typeof slot !== 'string' && slot.id === ph.id ? url : slot))
          : next.filter((slot) => !(typeof slot !== 'string' && slot.id === ph.id))
      }
      return next
    })
    results.forEach(({ ph }) => URL.revokeObjectURL(ph.previewUrl))
    const failed = results.find((r) => !r.url)
    if (failed) onUploadError?.(failed.error)
  }

  function handleDrawingSave(blob) {
    const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' })
    setSubTool(null)
    uploadFiles([file])
  }

  // A single scanned page behaves exactly like a photo. Multiple pages
  // arrive already combined into one PDF (see DocumentScanner), so they go
  // through the generic file-attachment pipeline instead.
  function handleScanSave(blob) {
    const file = new File([blob], `scan-${Date.now()}.png`, { type: 'image/png' })
    setSubTool(null)
    uploadFiles([file])
  }

  function handleScanPdfSave(blob) {
    const file = new File([blob], `scan-${Date.now()}.pdf`, { type: 'application/pdf' })
    setSubTool(null)
    uploadAttachments([file])
  }

  function handleAudioSave(blob) {
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `voice-memo-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' })
    setSubTool(null)
    uploadAudioClips([file])
  }

  // Generic (non-image, non-audio) file attachments — PDFs, Word docs,
  // spreadsheets, anything shared in from the OS share sheet or picked
  // manually. Same placeholder-then-swap pipeline, but placeholders carry
  // name/size/type since there's no thumbnail to show.
  async function uploadAttachments(files) {
    const placeholders = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
      uploading: true,
    }))
    setAttachments((atts) => [...atts, ...placeholders])

    const results = await Promise.all(
      placeholders.map((ph, i) => onUploadImage(files[i]).then((res) => ({ ph, url: res.url, error: res.error })))
    )

    setAttachments((atts) => {
      let next = atts
      for (const { ph, url } of results) {
        next = url
          ? next.map((a) => (a.id === ph.id ? { ...a, url, uploading: false } : a))
          : next.filter((a) => a.id !== ph.id)
      }
      return next
    })
    const failed = results.find((r) => !r.url)
    if (failed) onUploadError?.(failed.error)
  }

  // Restoring a version snapshots the current (pre-restore) content first,
  // bypassing the normal checkpoint timer, so undoing a restore is always
  // possible too — not just the original edit.
  async function handleRestoreVersion(version) {
    if (currentId) {
      await saveVersionIfChanged(currentId, sessionBaselineRef.current || snapshotOf(buildPatch()), buildPatch())
    }
    setTitle(version.title || '')
    setText(version.text || '')
    setChecklist(version.checklist || [])
    setIsChecklist((version.checklist || []).length > 0)
    setImages(version.images || [])
    setAudioClips(version.audio || [])
    setAttachments(version.files || [])
    sessionBaselineRef.current = snapshotOf(version)
    lastVersionSavedAtRef.current = Date.now()
    setShowHistory(false)
    onToast?.('Version restored')
  }

  function handleDocFile(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    uploadAttachments(files)
  }

  async function handleEditSave(blob) {
    const idx = editingImage
    const original = images[idx]
    setEditingImage(null)
    const file = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const placeholderId = crypto.randomUUID()
    setImages((imgs) =>
      imgs.map((slot, i) => (i === idx ? { id: placeholderId, previewUrl: URL.createObjectURL(file), uploading: true } : slot))
    )
    const { url, error } = await onUploadImage(file)
    setImages((imgs) => imgs.map((slot) => (typeof slot !== 'string' && slot.id === placeholderId ? (url || original) : slot)))
    // Edited pixels can change the text in the photo (crop, rotate), so
    // re-run OCR against the edit rather than carrying over the old result.
    if (url) extractTextFromImages([file], (_, text) => {
      if (text) setOcrText((prev) => ({ ...prev, [url]: text }))
    })
    if (!url) onUploadError?.(error)
  }

  function clearImgLongPressTimer() {
    if (imgLongPressTimer.current) {
      clearTimeout(imgLongPressTimer.current)
      imgLongPressTimer.current = null
    }
  }

  function toggleImageSelected(i) {
    setImageSelection((sel) => {
      const next = new Set(sel)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function handleThumbTouchStart(i, e) {
    imgLongPressFired.current = null
    const touch = e.touches?.[0]
    if (touch) imgTouchStartPos.current = { x: touch.clientX, y: touch.clientY }
    clearImgLongPressTimer()
    // Once already selecting, a plain tap toggles images in and out, so
    // long press doesn't need to do anything further at that point.
    if (imageSelectMode) return
    imgLongPressTimer.current = setTimeout(() => {
      imgLongPressFired.current = i
      setImageSelection(new Set([i]))
      if (navigator.vibrate) navigator.vibrate(10)
    }, IMG_LONG_PRESS_MS)
  }

  function handleThumbTouchMove(e) {
    const touch = e.touches?.[0]
    if (touch) {
      const dx = touch.clientX - imgTouchStartPos.current.x
      const dy = touch.clientY - imgTouchStartPos.current.y
      if (Math.sqrt(dx * dx + dy * dy) > IMG_MOVE_TOLERANCE) clearImgLongPressTimer()
    }
  }

  function handleThumbTouchEnd() {
    clearImgLongPressTimer()
  }

  function handleThumbMouseDown(i, e) {
    if (imageSelectMode || e.button !== 0) return
    imgLongPressFired.current = null
    clearImgLongPressTimer()
    imgLongPressTimer.current = setTimeout(() => {
      imgLongPressFired.current = i
      setImageSelection(new Set([i]))
    }, IMG_LONG_PRESS_MS)
  }

  function handleThumbMouseUpOrLeave() {
    clearImgLongPressTimer()
  }

  function handleThumbClick(i) {
    // A long press already put us into selection mode: swallow this tap
    // instead of also opening the lightbox.
    if (imgLongPressFired.current === i) {
      imgLongPressFired.current = null
      return
    }
    if (imageSelectMode) {
      toggleImageSelected(i)
      return
    }
    setLightboxIndex(i)
  }

  function selectAllImages() {
    setImageSelection((sel) => (sel.size === images.length ? new Set() : new Set(images.map((_, i) => i))))
  }

  function deleteSelectedImages() {
    setImages((imgs) => imgs.filter((_, idx) => !imageSelection.has(idx)))
    setImageSelection(new Set())
    setShowShareMenu(false)
  }

  function selectedImageUrls() {
    return images.filter((slot, i) => imageSelection.has(i) && typeof slot === 'string')
  }

  // Fetches each selected image's bytes and returns File objects. Firebase
  // Storage URLs load fine in <img> tags but plain fetch() can be blocked by
  // the bucket's CORS config, so each fetch fails independently — a caller
  // gets back only the images that actually came through, plus a count of
  // how many didn't, rather than one failure silently killing everything.
  async function fetchImagesAsFiles(urls) {
    const results = await Promise.all(
      urls.map(async (url, i) => {
        try {
          // Bypass the service worker's CacheFirst route for Firebase Storage
          // (see sw.js) with a cache-busting param — otherwise a stale opaque
          // (no-cors) response cached before the bucket's CORS was fixed
          // keeps getting served here forever instead of a real network hit.
          const bustUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now()
          const res = await fetch(bustUrl, { cache: 'no-store' })
          if (!res.ok) throw new Error('bad response')
          const blob = await res.blob()
          return new File([blob], `image-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' })
        } catch {
          return null
        }
      })
    )
    return { files: results.filter(Boolean), failed: results.filter((r) => !r).length }
  }

  async function shareAsPictures() {
    if (sharingImages) return
    setSharingImages(true)
    setShowShareMenu(false)
    const urls = selectedImageUrls()
    try {
      const { files, failed } = await fetchImagesAsFiles(urls)
      if (!files.length) {
        onToast?.("Couldn't attach those pictures to share — the storage bucket may be blocking direct downloads. Try Share as link instead.")
        return
      }
      if (navigator.share && navigator.canShare?.({ files })) {
        await navigator.share({ files, title: title || 'Images' })
        if (failed) onToast?.(`Shared ${files.length} of ${urls.length} pictures — the rest couldn't be downloaded.`)
      } else {
        onToast?.("This device can't share picture files directly.")
      }
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error('share failed:', err); onToast?.('Sharing pictures failed.') }
    } finally {
      setSharingImages(false)
    }
  }

  async function shareAsPDF() {
    if (sharingImages) return
    setSharingImages(true)
    setShowShareMenu(false)
    const urls = selectedImageUrls()
    try {
      const { files, failed } = await fetchImagesAsFiles(urls)
      if (!files.length) {
        onToast?.("Couldn't load those pictures to build a PDF — the storage bucket may be blocking direct downloads. Try Share as link instead.")
        return
      }

      const doc = new jsPDF({ unit: 'pt' })
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(files[i])
        })
        const dims = await new Promise((resolve, reject) => {
          const probe = new Image()
          probe.onload = () => resolve({ w: probe.width, h: probe.height })
          probe.onerror = reject
          probe.src = dataUrl
        })
        const pageW = doc.internal.pageSize.getWidth()
        const pageH = doc.internal.pageSize.getHeight()
        const scale = Math.min(pageW / dims.w, pageH / dims.h)
        const w = dims.w * scale
        const h = dims.h * scale
        if (i > 0) doc.addPage()
        doc.addImage(dataUrl, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h)
      }

      const pdfBlob = doc.output('blob')
      const pdfFile = new File([pdfBlob], `${title || 'images'}.pdf`, { type: 'application/pdf' })

      if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
        await navigator.share({ files: [pdfFile], title: title || 'Images' })
        if (failed) onToast?.(`Built the PDF from ${files.length} of ${urls.length} pictures — the rest couldn't be downloaded.`)
      } else {
        // No file-sharing support: fall back to downloading the PDF locally.
        const link = document.createElement('a')
        link.href = URL.createObjectURL(pdfBlob)
        link.download = pdfFile.name
        link.click()
        URL.revokeObjectURL(link.href)
        onToast?.('PDF downloaded — this device can\u2019t share files directly.')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error('PDF share failed:', err); onToast?.("Couldn't build the PDF.") }
    } finally {
      setSharingImages(false)
    }
  }

  async function shareAsLink() {
    setShowShareMenu(false)
    const urls = selectedImageUrls()
    if (!urls.length) return
    try {
      if (navigator.share) {
        await navigator.share({ text: urls.join('\n'), title: title || 'Images' })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(urls.join('\n'))
        onToast?.('Copied link(s) to clipboard')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('link share failed:', err)
    }
  }

  return (
    <motion.div
      className="modal-backdrop"
      onClick={handleClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        ref={modalCardRef}
        layoutId={note?.id ? `note-${note.id}` : undefined}
        className="modal-card"
        style={{ background: background === 'none' ? NOTE_COLORS[color] : undefined }}
        onClick={(e) => e.stopPropagation()}
        initial={note?.id ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={note?.id ? undefined : { opacity: 0, scale: 0.96 }}
        transition={{
          layout: { type: 'spring', stiffness: 500, damping: 42, mass: 0.9 },
          opacity: { duration: 0.15 },
          scale: { duration: 0.15 },
        }}
      >
      {background !== 'none' && (
        <div className="modal-card-bg" style={{ background: NOTE_BACKGROUNDS[background] }} />
      )}
      <div className="modal-card-content">
      <div className="note-editor-header">
        <div className="note-editor-topbar">
          {imageSelectMode ? (
            <>
              <button className="icon-btn" onClick={() => { setImageSelection(new Set()); setShowShareMenu(false) }} title="Cancel selection">
                <IconClose width="20" height="20" />
              </button>
              <span className="selection-bar-count" style={{ marginLeft: 2 }}>{imageSelection.size} selected</span>
              <button className="selection-bar-textbtn" onClick={selectAllImages}>
                {imageSelection.size === images.length ? 'Clear all' : 'Select all'}
              </button>
              <div style={{ flex: 1 }} />
              <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" onClick={() => setShowShareMenu((v) => !v)} disabled={sharingImages} title="Share selected">
                  <IconShare width="18" height="18" />
                </button>
                {showShareMenu && (
                  <div className="more-menu share-options-menu">
                    <button className="more-menu-item" onClick={shareAsPictures}>
                      <IconImage width="16" height="16" /> Share as pictures
                    </button>
                    <button className="more-menu-item" onClick={shareAsPDF}>
                      <IconFileDoc width="16" height="16" /> Share as PDF
                    </button>
                    <button className="more-menu-item" onClick={shareAsLink}>
                      <IconAttachment width="16" height="16" /> Share as link
                    </button>
                  </div>
                )}
              </div>
              <button className="icon-btn" onClick={deleteSelectedImages} title="Delete selected">
                <IconTrash width="19" height="19" />
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" onClick={handleClose} title="Back">
                <IconBack width="20" height="20" />
              </button>
              <div style={{ flex: 1 }} />
              <button className="icon-btn" onClick={() => setPinned((v) => !v)} title={pinned ? 'Unpin' : 'Pin'}>
                {pinned ? <IconUnpin width="19" height="19" /> : <IconPin width="19" height="19" />}
              </button>
              <button
                className="icon-btn"
                onClick={() => setShowReminder((v) => !v)}
                title="Reminder"
                style={reminderAt ? { color: 'var(--accent)' } : undefined}
              >
                <IconBell width="19" height="19" />
              </button>
              <button className="icon-btn" onClick={() => setArchived((v) => !v)} title={archived ? 'Unarchive' : 'Archive'}>
                <IconArchive width="19" height="19" />
              </button>
            </>
          )}
        </div>

        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={isNew}
          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}
        />

        {!isChecklist && (
          <div className="format-toolbar" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn"
              onMouseDown={(e) => { e.preventDefault(); undoRedo('undo') }}
              title="Undo"
            >
              <IconUndo width="18" height="18" />
            </button>
            <button
              type="button"
              className="icon-btn"
              onMouseDown={(e) => { e.preventDefault(); undoRedo('redo') }}
              title="Redo"
            >
              <IconRedo width="18" height="18" />
            </button>
            <span className="format-toolbar-divider" />
            <button
              type="button"
              className={`icon-btn ${activeFormats.bold ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyFormat('bold') }}
              title="Bold"
            >
              <IconBold />
            </button>
            <button
              type="button"
              className={`icon-btn ${activeFormats.italic ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyFormat('italic') }}
              title="Italic"
            >
              <IconItalic />
            </button>
            <button
              type="button"
              className={`icon-btn ${activeFormats.underline ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyFormat('underline') }}
              title="Underline"
            >
              <IconUnderline />
            </button>
            <span className="format-toolbar-divider" />
            <button
              type="button"
              className={`icon-btn ${activeFormats.ul ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyFormat('insertUnorderedList') }}
              title="Bulleted list"
            >
              <IconBulletList />
            </button>
            <button
              type="button"
              className={`icon-btn ${activeFormats.ol ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); applyFormat('insertOrderedList') }}
              title="Numbered list"
            >
              <IconNumberedList />
            </button>
          </div>
        )}
      </div>

      <div className="note-editor-scroll">
        {conflict && (
          <div className="conflict-banner">
            <span>This note was edited on another device while you had it open.</span>
            <div className="conflict-banner-actions">
              <button onClick={acceptRemoteVersion}>Use their version</button>
              <button onClick={keepLocalVersion}>Keep mine</button>
            </div>
          </div>
        )}
        {(images.length > 0 || audioClips.length > 0 || attachments.length > 0) && (
          <div className="note-editor-attachments" style={{ marginTop: 0 }}>
            {images.length > 0 && (
              <div className={`note-editor-image-grid grid-${Math.min(images.length, 6)}`} style={{ margin: 0 }}>
                {images.map((slot, i) => {
                  const pending = isUploading(slot)
                  const isSelected = imageSelection.has(i)
                  return (
                    <div
                      key={pending ? slot.id : `${slot}-${i}`}
                      className={`thumb-wrap ${isSelected ? 'thumb-selected' : ''}`}
                      onClick={(e) => { e.stopPropagation(); if (!pending) handleThumbClick(i) }}
                      onTouchStart={(e) => !pending && handleThumbTouchStart(i, e)}
                      onTouchMove={handleThumbTouchMove}
                      onTouchEnd={handleThumbTouchEnd}
                      onTouchCancel={handleThumbTouchEnd}
                      onMouseDown={(e) => !pending && handleThumbMouseDown(i, e)}
                      onMouseUp={handleThumbMouseUpOrLeave}
                      onMouseLeave={handleThumbMouseUpOrLeave}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <img
                        src={srcOf(slot)}
                        alt=""
                        crossOrigin="anonymous"
                        style={{
                          cursor: pending ? 'default' : 'pointer',
                          opacity: pending ? 0.6 : 1,
                        }}
                      />
                      {!pending && imageSelectMode && (
                        <div className={`drive-select-check drive-select-check-card ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <IconCheck width="13" height="13" />}
                        </div>
                      )}
                      {pending && (
                        <>
                          <div className="thumb-spinner" aria-label="Uploading">
                            <span className="spinner" />
                          </div>
                          <button
                            className="thumb-remove"
                            title="Cancel upload"
                            onClick={() => setImages((imgs) => imgs.filter((_, idx) => idx !== i))}
                          >
                            <IconClose width="12" height="12" />
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {audioClips.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
                {audioClips.map((clip, i) => {
                  const pending = isUploading(clip)
                  return (
                    <div key={pending ? clip.id : `${clip}-${i}`} className="audio-clip-row" onClick={(e) => e.stopPropagation()}>
                      {pending ? (
                        <>
                          <span className="spinner" />
                          <span className="audio-clip-label">Uploading voice memo…</span>
                        </>
                      ) : (
                        <>
                          <IconMic width="16" height="16" />
                          <audio controls src={clip} style={{ flex: 1, height: 32 }} />
                        </>
                      )}
                      <button
                        className="icon-btn"
                        title="Remove voice memo"
                        onClick={() => setAudioClips((clips) => clips.filter((_, idx) => idx !== i))}
                      >
                        <IconClose width="14" height="14" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
                {attachments.map((a) => (
                  <div key={a.id || a.url} className="audio-clip-row" onClick={(e) => e.stopPropagation()}>
                    {a.uploading ? (
                      <>
                        <span className="spinner" />
                        <span className="audio-clip-label">Uploading {a.name}…</span>
                      </>
                    ) : (
                      <>
                        <IconFileDoc width="16" height="16" />
                        <a href={a.url} target="_blank" rel="noreferrer" className="audio-clip-label" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.name} {a.size ? `· ${formatBytes(a.size)}` : ''}
                        </a>
                      </>
                    )}
                    <button
                      className="icon-btn"
                      title="Remove file"
                      onClick={() => setAttachments((atts) => atts.filter((x) => x !== a))}
                    >
                      <IconClose width="14" height="14" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isChecklist ? (
          <div
            ref={textEditorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleTextInput}
            onBlur={handleTextBlur}
            onKeyUp={refreshActiveFormats}
            onMouseUp={refreshActiveFormats}
            onFocus={refreshActiveFormats}
            onClick={(e) => {
              // Inside a contentEditable, a plain click on a link would just
              // place the caret — Ctrl/Cmd-click is the usual escape hatch,
              // but on a touchscreen there's no such modifier, so a tap on
              // a note-link here opens it directly instead.
              if (e.target.tagName === 'A' && e.target.classList.contains('note-link')) {
                e.preventDefault()
                window.open(e.target.href, '_blank', 'noopener,noreferrer')
              }
            }}
            data-placeholder="Take a note..."
            className="note-editor-textarea note-editor-richtext"
            style={{
              width: '100%',
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: 15,
              marginTop: (images.length || audioClips.length || attachments.length) ? 10 : 6,
              fontFamily: 'inherit',
              minHeight: (images.length || audioClips.length || attachments.length) ? 0 : 160,
            }}
          />
        ) : (
          <div style={{ marginTop: 10 }}>
            {checklist.map((item, idx) => (
              <div className="checklist-item" key={item.id}>
                <input type="checkbox" checked={item.done} onChange={(e) => updateItem(idx, { done: e.target.checked })} />
                <input
                  type="text"
                  placeholder="List item"
                  value={item.text}
                  onChange={(e) => updateItem(idx, { text: e.target.value })}
                  style={{ border: 'none', background: 'none', outline: 'none', flex: 1, fontSize: 13.5 }}
                />
                <button className="icon-btn" onClick={() => removeItem(idx)} title="Remove item">&#10005;</button>
              </div>
            ))}
            <button className="text-btn" onClick={addChecklistItem}>+ Add item</button>
          </div>
        )}

        {showReminder && (
          <div style={{ marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
            <label style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>Remind me</label>
            <br />
            <input
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              style={{ marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)' }}
            />
            {reminderAt && (
              <button className="icon-btn" title="Clear reminder" onClick={() => setReminderAt('')} style={{ marginLeft: 6 }}>
                <IconClose width="14" height="14" />
              </button>
            )}
          </div>
        )}

        {labels.length > 0 && (
          <div className="note-labels" style={{ marginTop: 14 }}>
            {labels.map((l) => (
              <button
                key={l.id}
                className="label-chip"
                style={{
                  background: selectedLabels.includes(l.id) ? '#1A73E8' : 'var(--surface-soft)',
                  color: selectedLabels.includes(l.id) ? '#fff' : 'var(--ink-soft)',
                  border: 'none',
                }}
                onClick={() => toggleLabel(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}

        {showColors && (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="color-swatches">
              {Object.entries(NOTE_COLORS).map(([name, hex]) => (
                <button
                  key={name}
                  className={`swatch ${background === 'none' && color === name ? 'selected' : ''}`}
                  style={{ background: hex }}
                  onClick={() => { setColor(name); setBackground('none') }}
                  aria-label={name}
                />
              ))}
            </div>

            <div className="bg-swatches">
              {Object.entries(NOTE_BACKGROUNDS).map(([name, css]) => (
                <button
                  key={name}
                  className={`bg-swatch ${background === name ? 'selected' : ''}`}
                  style={{ background: css }}
                  onClick={() => setBackground(name)}
                  aria-label={NOTE_BACKGROUND_LABELS[name]}
                  title={NOTE_BACKGROUND_LABELS[name]}
                />
              ))}
            </div>
          </div>
        )}

      </div>

        <div className="composer-row" style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={() => fileInput.current?.click()} title="Add image" disabled={uploading}>
            {uploading ? '...' : <IconImage width="18" height="18" />}
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={handleFile} />
          <button className={`icon-btn ${showColors ? 'active' : ''}`} onClick={() => setShowColors((v) => !v)} title="Background options">
            <IconWallpaper width="18" height="18" />
          </button>
          <button className={`icon-btn ${isChecklist ? 'active' : ''}`} onClick={() => setIsChecklist((v) => !v)} title="Toggle checklist">
            <IconChecklist width="18" height="18" />
          </button>

          <div style={{ marginLeft: 'auto', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn" onClick={() => setShowMoreMenu((v) => !v)} title="More options">
              <IconMoreVert width="19" height="19" />
            </button>
            {showMoreMenu && (
              <div className="more-menu">
                <button className="more-menu-item" onClick={() => { setSubTool('drawing'); setShowMoreMenu(false) }}>
                  <IconDrawing width="17" height="17" /> Add drawing
                </button>
                <button className="more-menu-item" onClick={() => { setSubTool('scan'); setShowMoreMenu(false) }}>
                  <IconScan width="17" height="17" /> Scan document
                </button>
                <button className="more-menu-item" onClick={() => { setSubTool('audio'); setShowMoreMenu(false) }} disabled={audioUploading}>
                  <IconMic width="17" height="17" /> Record voice memo
                </button>
                <button className="more-menu-item" onClick={() => { docInput.current?.click(); setShowMoreMenu(false) }} disabled={docsUploading}>
                  <IconAttachment width="17" height="17" /> Attach file
                </button>
                {!isNew && (
                  <button className="more-menu-item" onClick={() => { setShowHistory(true); setShowMoreMenu(false) }}>
                    <IconRestore width="17" height="17" /> Version history
                  </button>
                )}
                {!isNew && (
                  <button className="more-menu-item" onClick={() => { onDeleteForever(note.id); onClose() }}>
                    <IconTrash width="17" height="17" /> Delete forever
                  </button>
                )}
              </div>
            )}
          </div>
          <input ref={docInput} type="file" multiple hidden onChange={handleDocFile} />
        </div>
      </div>
      </motion.div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onEdit={(i) => {
            setLightboxIndex(null)
            setEditingImage(i)
          }}
          onDelete={(i) => {
            setImages((imgs) => imgs.filter((_, idx) => idx !== i))
            setLightboxIndex(null)
          }}
        />
      )}

      {editingImage !== null && (
        <ImageEditor
          src={images[editingImage]}
          onCancel={() => setEditingImage(null)}
          onSave={handleEditSave}
        />
      )}

      {subTool === 'drawing' && (
        <DrawingCanvas onCancel={() => setSubTool(null)} onSave={handleDrawingSave} />
      )}
      {subTool === 'scan' && (
        <DocumentScanner onCancel={() => setSubTool(null)} onSave={handleScanSave} onSavePdf={handleScanPdfSave} />
      )}
      {subTool === 'audio' && (
        <AudioRecorder onCancel={() => setSubTool(null)} onSave={handleAudioSave} />
      )}

      {showHistory && (
        <VersionHistoryPanel
          noteId={currentId}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreVersion}
        />
      )}
    </motion.div>
  )
})

export default NoteEditorModal
