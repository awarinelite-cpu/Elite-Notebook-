import JSZip from 'jszip'

// Google Keep's internal color names -> our palette. Not a perfect match,
// just the closest available swatch for each.
const KEEP_COLOR_MAP = {
  DEFAULT: 'default',
  RED: 'coral',
  ORANGE: 'peach',
  YELLOW: 'sand',
  GREEN: 'sage',
  TEAL: 'fog',
  BLUE: 'storm',
  CERULEAN: 'storm',
  DARK_BLUE: 'storm',
  PURPLE: 'dusk',
  PINK: 'blossom',
  BROWN: 'clay',
  GRAY: 'clay',
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Keep's plain-text notes use \n for line breaks; our notes store lightweight
// HTML, so turn those into <br> rather than losing the line structure.
function textToHtml(text) {
  if (!text) return ''
  return text.split('\n').map(escapeHtml).join('<br>')
}

// Google Takeout's Keep export doesn't give each note a stable "id" field in
// its JSON body — but createdTimestampUsec is set once at creation and never
// changes across re-exports, so it works as a natural unique key for
// deduping re-imports. Fall back to the edited timestamp, then a snippet of
// the content itself, for the rare note missing both.
function keepIdFor(raw) {
  if (raw.createdTimestampUsec) return `usec:${raw.createdTimestampUsec}`
  if (raw.userEditedTimestampUsec) return `edited:${raw.userEditedTimestampUsec}`
  return `sig:${(raw.title || '') + '|' + (raw.textContent || '')}`.slice(0, 200)
}

/**
 * Reads a Google Takeout "Keep" export (.zip) and returns the notes inside
 * it in Elite Notebook's shape, ready to hand to createNote. Does not write
 * anything itself, and doesn't extract attachment bytes yet — each note's
 * `attachments` list points at zip entry names for the caller to pull out
 * (via the returned `zip`) and upload one at a time, alongside `zip` itself.
 */
export async function parseKeepZip(file) {
  const zip = await JSZip.loadAsync(file)
  const notes = []
  let skippedTrashed = 0
  let attachmentsSkipped = 0

  const entries = Object.values(zip.files).filter((f) => !f.dir && /\.json$/i.test(f.name))

  for (const entry of entries) {
    let raw
    try {
      raw = JSON.parse(await entry.async('text'))
    } catch {
      continue // not valid JSON — not a note, skip quietly
    }

    // Keep's export includes a few non-note JSON files (e.g. label
    // definitions) that don't have this shape at all.
    const looksLikeNote = raw.textContent !== undefined || raw.listContent !== undefined || raw.title !== undefined
    if (!looksLikeNote) continue

    if (raw.isTrashed) {
      skippedTrashed += 1
      continue
    }

    // Attachment files sit alongside the note's own JSON inside the zip
    // (Takeout doesn't give a full path, just a filename), so resolve each
    // one against the JSON entry's own directory. Any that can't be found
    // (e.g. split across a different zip part than its note) are counted
    // as skipped rather than failing the whole note.
    const dir = entry.name.includes('/') ? entry.name.slice(0, entry.name.lastIndexOf('/') + 1) : ''
    const attachments = []
    for (const att of Array.isArray(raw.attachments) ? raw.attachments : []) {
      const zipEntry = att.filePath && zip.file(dir + att.filePath)
      if (zipEntry) {
        attachments.push({ entryName: zipEntry.name, mimetype: att.mimetype || '' })
      } else {
        attachmentsSkipped += 1
      }
    }

    const hasChecklist = Array.isArray(raw.listContent) && raw.listContent.length > 0

    notes.push({
      keepId: keepIdFor(raw),
      title: raw.title || '',
      text: hasChecklist ? '' : textToHtml(raw.textContent || ''),
      checklist: hasChecklist
        ? raw.listContent.map((item) => ({
            id: crypto.randomUUID(),
            text: item.text || '',
            done: !!item.isChecked,
          }))
        : [],
      color: KEEP_COLOR_MAP[raw.color] || 'default',
      pinned: !!raw.isPinned,
      archived: !!raw.isArchived,
      labelNames: Array.isArray(raw.labels) ? raw.labels.map((l) => l.name).filter(Boolean) : [],
      attachments,
    })
  }

  return { zip, notes, skippedTrashed, attachmentsSkipped }
}
