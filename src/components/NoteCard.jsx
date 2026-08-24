import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { getNoteColors, NOTE_BACKGROUNDS } from '../constants.js'
import { IconBell, IconPin, IconUnpin, IconArchive, IconTrash, IconRestore, IconClose, IconFileDoc, IconShare, IconCheck, IconText } from './Icons.jsx'
import ImageLightbox from './ImageLightbox.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { stripHtml } from '../lib/richText.js'

function formatReminder(ts) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function NoteCard({
  note,
  labels,
  onEdit,
  onTogglePin,
  onArchive,
  onTrash,
  onRestore,
  onDeleteForever,
  onToggleChecklistItem,
  view,
  selectMode,
  selected,
  onToggleSelect,
  onLongPressSelect,
  hidden,
}) {
  const { theme } = useTheme()
  const NOTE_COLORS = getNoteColors(theme)
  const overdue = note.reminderAt && new Date(note.reminderAt) < new Date()
  const noteLabels = (note.labels || []).map((id) => labels.find((l) => l.id === id)).filter(Boolean)
  const images = note.images || []
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const cardRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const touchMoved = useRef(false)
  const hadSwipe = useRef(false)

  const LONG_PRESS_MS = 450
  const MOVE_TOLERANCE = 10
  const touchStartPos = useRef({ x: 0, y: 0 })

  // --- Swipe actions ---
  // Right swipe = reversible "positive" action (archive / restore).
  // Left swipe = trash, or in the trash view itself, permanent delete
  // (given a bigger threshold since that one can't be undone).
  const [swipeX, setSwipeX] = useState(0)
  const swiping = useRef(false)
  const SWIPE_COMMIT = 88
  const SWIPE_COMMIT_DESTRUCTIVE = 150
  const SWIPE_CAP = 120

  function getSwipeActions() {
    if (view === 'trash') {
      return {
        right: { icon: IconRestore, label: 'Restore', run: () => onRestore(note), threshold: SWIPE_COMMIT },
        left: { icon: IconTrash, label: 'Delete forever', run: () => onDeleteForever(note.id), threshold: SWIPE_COMMIT_DESTRUCTIVE, destructive: true },
      }
    }
    return {
      right: { icon: IconArchive, label: note.archived ? 'Unarchive' : 'Archive', run: () => onArchive(note), threshold: SWIPE_COMMIT },
      left: { icon: IconTrash, label: 'Trash', run: () => onTrash(note), threshold: SWIPE_COMMIT },
    }
  }

  function clearLongPressTimer() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleTouchStart(e) {
    touchMoved.current = false
    longPressFired.current = false
    hadSwipe.current = false
    const touch = e.touches?.[0]
    if (touch) touchStartPos.current = { x: touch.clientX, y: touch.clientY }
    clearLongPressTimer()
    // Long press enters (or extends) multi-select mode for this note.
    // Once already selecting, a plain tap toggles notes in and out, so
    // long press doesn't need to do anything further at that point.
    if (selectMode) return
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      onLongPressSelect(note)
      if (navigator.vibrate) navigator.vibrate(10)
    }, LONG_PRESS_MS)
  }

  function handleTouchMove(e) {
    const touch = e.touches?.[0]
    if (!touch) return
    const dx = touch.clientX - touchStartPos.current.x
    const dy = touch.clientY - touchStartPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_TOLERANCE) {
      touchMoved.current = true
      clearLongPressTimer()
    }
    // Selection mode has its own tap-to-toggle interaction — don't also
    // interpret drags as swipes there. Same once a long press has already
    // fired for this touch.
    if (selectMode || longPressFired.current) return
    const horizontalDominant = Math.abs(dx) > Math.abs(dy) * 1.3
    if (horizontalDominant && Math.abs(dx) > 8) {
      swiping.current = true
      hadSwipe.current = true
      // Rubber-band past the cap instead of a hard stop, so a big swipe
      // still feels responsive without the card flying off under the finger.
      const over = Math.max(0, Math.abs(dx) - SWIPE_CAP)
      const capped = Math.sign(dx) * (Math.min(Math.abs(dx), SWIPE_CAP) + over * 0.25)
      setSwipeX(capped)
    }
  }

  function handleTouchEnd() {
    clearLongPressTimer()
    if (swiping.current) {
      swiping.current = false
      const actions = getSwipeActions()
      const action = swipeX > 0 ? actions.right : swipeX < 0 ? actions.left : null
      if (action && Math.abs(swipeX) > action.threshold) action.run()
      setSwipeX(0)
    }
  }

  function handleCardClick() {
    // A long press already put us into selection mode, or this tap was
    // actually the tail end of a swipe: swallow it instead of opening the
    // editor too.
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (hadSwipe.current) {
      hadSwipe.current = false
      return
    }
    if (selectMode) {
      onToggleSelect(note)
      return
    }
    onEdit(note)
  }

  async function handleShare(e) {
    e.stopPropagation()
    if (sharing) return
    setSharing(true)

    const parts = []
    if (note.title) parts.push(note.title)
    if (note.text) parts.push(stripHtml(note.text))
    if (note.checklist?.length) {
      parts.push(note.checklist.map((c) => `${c.done ? '\u2611' : '\u2610'} ${c.text}`).join('\n'))
    }
    if (note.files?.length) {
      parts.push(note.files.map((f) => f.url).join('\n'))
    }
    const shareText = parts.join('\n\n')
    const shareTitle = note.title || 'Note'

    try {
      // Best effort: pull the note's images in as real files so the share
      // sheet can attach them (Photos, WhatsApp, etc.), not just their URLs.
      let files = []
      if (navigator.canShare && images.length) {
        try {
          files = await Promise.all(
            images.slice(0, 5).map(async (url, i) => {
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
          await navigator.share({ title: shareTitle, text: shareText, files })
        } else {
          await navigator.share({ title: shareTitle, text: shareText })
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText || shareTitle)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch (err) {
      // AbortError just means the person closed the share sheet — not an error worth surfacing.
      if (err?.name !== 'AbortError') console.error('share failed:', err)
    } finally {
      setSharing(false)
    }
  }

  function handleMouseDown(e) {
    // Ignore mouse-down on interactive children (checkboxes, links, etc.)
    // and skip entirely once already in selection mode, same as touch.
    if (selectMode || e.button !== 0) return
    longPressFired.current = false
    clearLongPressTimer()
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      onLongPressSelect(note)
    }, LONG_PRESS_MS)
  }

  function handleMouseUpOrLeave() {
    clearLongPressTimer()
  }

  const swipeActions = getSwipeActions()
  const activeSwipeAction = swipeX > 0 ? swipeActions.right : swipeX < 0 ? swipeActions.left : null
  const swipeCommitted = activeSwipeAction && Math.abs(swipeX) > activeSwipeAction.threshold

  return (
    <>
    <div className="note-card-swipe-wrapper">
      {swipeX !== 0 && activeSwipeAction && (
        <div
          className={`note-card-swipe-bg ${swipeX > 0 ? 'note-card-swipe-bg-right' : 'note-card-swipe-bg-left'} ${activeSwipeAction.destructive ? 'note-card-swipe-bg-destructive' : ''} ${swipeCommitted ? 'note-card-swipe-bg-committed' : ''}`}
        >
          <activeSwipeAction.icon width="20" height="20" />
          <span>{activeSwipeAction.label}</span>
        </div>
      )}
    <motion.div
      layoutId={`note-${note.id}`}
      ref={cardRef}
      className={`note-card ${selected ? 'note-card-selected' : ''}`}
      style={{
        background:
          note.background && note.background !== 'none'
            ? NOTE_BACKGROUNDS[note.background]
            : NOTE_COLORS[note.color] || NOTE_COLORS.default,
        // x (not a raw transform string) so this composes with framer's own
        // layout-projection transform instead of clobbering it.
        x: swipeX,
        pointerEvents: hidden ? 'none' : undefined,
        transition: swiping.current ? 'box-shadow 0.15s ease' : 'box-shadow 0.15s ease',
      }}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ opacity: { duration: 0.15 }, layout: { type: 'spring', stiffness: 500, damping: 42, mass: 0.9 } }}
      onClick={handleCardClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      {selectMode && (
        <div
          className={`drive-select-check drive-select-check-card ${selected ? 'checked' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(note) }}
        >
          {selected && <IconCheck width="13" height="13" />}
        </div>
      )}

      {note.reminderAt && (
        <div className={`reminder-tag ${overdue ? 'overdue' : ''}`}>
          <IconBell width="12" height="12" /> {formatReminder(note.reminderAt)}
        </div>
      )}

      {note.title && <h3>{note.title}</h3>}

      {images.length === 1 && (
        <div className={`note-card-image-wrap ${!note.title && !note.reminderAt ? 'note-card-media-bleed' : ''}`}>
          <img
            src={images[0]}
            alt=""
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(0) }}
          />
          {note.imageText?.[images[0]] && (
            <div className="note-card-ocr-badge" title="Text in this photo is searchable">
              <IconText width="11" height="11" />
            </div>
          )}
        </div>
      )}

      {images.length > 1 && (
        <div
          className={`note-card-collage collage-${Math.min(images.length, 6)} ${!note.title && !note.reminderAt ? 'note-card-media-bleed' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {images.slice(0, 6).map((src, i) => (
            <div key={i} className="collage-tile" onClick={() => setLightboxIndex(i)}>
              <img src={src} alt="" />
              {i === 5 && images.length > 6 && (
                <div className="collage-more">+{images.length - 6}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {note.audio?.length > 0 && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
          {note.audio.map((src, i) => (
            <audio key={i} controls src={src} style={{ width: '100%', height: 32 }} />
          ))}
        </div>
      )}

      {note.files?.length > 0 && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
          {note.files.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="audio-clip-row"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <IconFileDoc width="16" height="16" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            </a>
          ))}
        </div>
      )}

      {note.text && <div className="note-card-text" dangerouslySetInnerHTML={{ __html: note.text }} />}

      {note.checklist?.length > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          {note.checklist.map((item) => (
            <label className={`checklist-item ${item.done ? 'done' : ''}`} key={item.id}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggleChecklistItem(note, item.id)}
              />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      )}

      {noteLabels.length > 0 && (
        <div className="note-labels">
          {noteLabels.map((l) => (
            <span className="label-chip" key={l.id}>{l.name}</span>
          ))}
        </div>
      )}

      {!selectMode && (
        <div
          className="note-actions"
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'relative' }}
        >
          <button className="icon-btn" title="Share" onClick={handleShare} disabled={sharing}>
            <IconShare width="18" height="18" />
          </button>
          {copied && <span className="share-copied-tip">Copied to clipboard</span>}
          {view !== 'trash' ? (
            <>
              <button className="icon-btn" title={note.pinned ? 'Unpin' : 'Pin'} onClick={() => onTogglePin(note)}>
                {note.pinned ? <IconUnpin /> : <IconPin />}
              </button>
              <button className="icon-btn" title={note.archived ? 'Unarchive' : 'Archive'} onClick={() => onArchive(note)}>
                <IconArchive width="18" height="18" />
              </button>
              <button className="icon-btn" title="Move to trash" onClick={() => onTrash(note)}>
                <IconTrash width="18" height="18" />
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" title="Restore" onClick={() => onRestore(note)}>
                <IconRestore />
              </button>
              <button className="icon-btn" title="Delete forever" onClick={() => onDeleteForever(note.id)}>
                <IconClose width="18" height="18" />
              </button>
            </>
          )}
        </div>
      )}
    </motion.div>
    </div>

    {lightboxIndex !== null && (
      <ImageLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    )}
    </>
  )
}
