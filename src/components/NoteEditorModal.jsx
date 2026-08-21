import { useEffect, useRef, useState } from 'react'
import { getNoteColors, NOTE_BACKGROUNDS, NOTE_BACKGROUND_LABELS } from '../constants.js'
import { IconChecklist, IconImage, IconTrash, IconClose, IconDrawing, IconMic, IconAttachment, IconFileDoc, IconBack, IconPin, IconUnpin, IconBell, IconArchive, IconWallpaper, IconMoreVert, IconBold, IconItalic, IconUnderline, IconBulletList, IconNumberedList, IconUndo, IconRedo, IconCheck, IconShare } from './Icons.jsx'
import ImageLightbox from './ImageLightbox.jsx'
import ImageEditor from './ImageEditor.jsx'
import DrawingCanvas from './DrawingCanvas.jsx'
import AudioRecorder from './AudioRecorder.jsx'
import { useTheme } from '../context/ThemeContext.jsx'

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

export default function NoteEditorModal({ note, initial, labels, onClose, onSave, onCreate, onDeleteForever, onUploadImage, onUploadError }) {
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
  const [audioClips, setAudioClips] = useState(base.audio || [])
  const [attachments, setAttachments] = useState(base.files || [])
  const [subTool, setSubTool] = useState(null) // 'drawing' | 'audio' | null
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [editingImage, setEditingImage] = useState(null) // index of image being edited
  // Long-press image selection, scoped to this open note (mirrors the
  // grid's long-press-to-select pattern, one level down at the image level).
  const [imageSelection, setImageSelection] = useState(() => new Set())
  const imageSelectMode = imageSelection.size > 0
  const [sharingImages, setSharingImages] = useState(false)
  const imgLongPressTimer = useRef(null)
  const imgLongPressFired = useRef(null) // index the long press fired for, or null
  const imgTouchStartPos = useRef({ x: 0, y: 0 })
  const IMG_LONG_PRESS_MS = 450
  const IMG_MOVE_TOLERANCE = 10
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
  const fileInput = useRef(null)
  const docInput = useRef(null)
  const textEditorRef = useRef(null)
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
    if (textEditorRef.current) textEditorRef.current.innerHTML = base.text || ''
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
      } else if (isNew && !creatingRef.current) {
        creatingRef.current = true
        const id = await onCreate(patch)
        creatingRef.current = false
        if (id) setCreatedId(id)
      }
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text, checklist, color, background, selectedLabels, images, audioClips, attachments, reminderAt, pinned, archived])

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
      placeholders.map((ph, i) => onUploadImage(files[i]).then((url) => ({ ph, url })))
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
    if (results.some((r) => !r.url)) onUploadError?.()
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
      placeholders.map((ph, i) => onUploadImage(files[i]).then((url) => ({ ph, url })))
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
    if (results.some((r) => !r.url)) onUploadError?.()
  }

  function handleDrawingSave(blob) {
    const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' })
    setSubTool(null)
    uploadFiles([file])
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
      placeholders.map((ph, i) => onUploadImage(files[i]).then((url) => ({ ph, url })))
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
    if (results.some((r) => !r.url)) onUploadError?.()
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
    const url = await onUploadImage(file)
    setImages((imgs) => imgs.map((slot) => (typeof slot !== 'string' && slot.id === placeholderId ? (url || original) : slot)))
    if (!url) onUploadError?.()
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
  }

  async function shareSelectedImages() {
    if (sharingImages) return
    setSharingImages(true)
    const urls = images
      .filter((slot, i) => imageSelection.has(i) && typeof slot === 'string')
      .map((slot) => slot)
    try {
      let files = []
      if (navigator.canShare && urls.length) {
        try {
          files = await Promise.all(
            urls.map(async (url, i) => {
              const res = await fetch(url)
              const blob = await res.blob()
              return new File([blob], `image-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' })
            })
          )
        } catch {
          files = []
        }
      }
      if (navigator.share) {
        if (files.length && navigator.canShare?.({ files })) {
          await navigator.share({ files, title: title || 'Images' })
        } else {
          await navigator.share({ text: urls.join('\n'), title: title || 'Images' })
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(urls.join('\n'))
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('share failed:', err)
    } finally {
      setSharingImages(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-card"
        style={{ background: background === 'none' ? NOTE_COLORS[color] : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
      {background !== 'none' && (
        <div className="modal-card-bg" style={{ background: NOTE_BACKGROUNDS[background] }} />
      )}
      <div className="modal-card-content">
      <div className="note-editor-header">
        <div className="note-editor-topbar">
          {imageSelectMode ? (
            <>
              <button className="icon-btn" onClick={() => setImageSelection(new Set())} title="Cancel selection">
                <IconClose width="20" height="20" />
              </button>
              <span className="selection-bar-count" style={{ marginLeft: 2 }}>{imageSelection.size} selected</span>
              <button className="selection-bar-textbtn" onClick={selectAllImages}>
                {imageSelection.size === images.length ? 'Clear all' : 'Select all'}
              </button>
              <div style={{ flex: 1 }} />
              <button className="icon-btn" onClick={shareSelectedImages} disabled={sharingImages} title="Share selected">
                <IconShare width="18" height="18" />
              </button>
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
            onKeyUp={refreshActiveFormats}
            onMouseUp={refreshActiveFormats}
            onFocus={refreshActiveFormats}
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
                <button className="more-menu-item" onClick={() => { setSubTool('audio'); setShowMoreMenu(false) }} disabled={audioUploading}>
                  <IconMic width="17" height="17" /> Record voice memo
                </button>
                <button className="more-menu-item" onClick={() => { docInput.current?.click(); setShowMoreMenu(false) }} disabled={docsUploading}>
                  <IconAttachment width="17" height="17" /> Attach file
                </button>
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
      </div>

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
      {subTool === 'audio' && (
        <AudioRecorder onCancel={() => setSubTool(null)} onSave={handleAudioSave} />
      )}
    </div>
  )
}
