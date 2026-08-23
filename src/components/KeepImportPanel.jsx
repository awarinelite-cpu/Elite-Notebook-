import { useRef, useState } from 'react'
import { parseKeepZip } from '../lib/keepImport.js'
import { IconImport } from './Icons.jsx'

const rowStyle = {
  padding: '12px 16px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 14,
  marginBottom: 10,
}

export default function KeepImportPanel({ notes, labels, createNote, createLabel, uploadImage, deleteNoteForever }) {
  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(null) // { done, total }
  const [deleteResult, setDeleteResult] = useState(null)

  const importedNotes = notes.filter((n) => n.keepId)

  async function handleDeleteAllImported() {
    if (!importedNotes.length) return
    const ok = window.confirm(
      `Delete all ${importedNotes.length} note${importedNotes.length === 1 ? '' : 's'} imported from Keep? This can't be undone.`
    )
    if (!ok) return

    setDeleting(true)
    setDeleteResult(null)
    setDeleteProgress({ done: 0, total: importedNotes.length })

    let deleted = 0
    for (const note of importedNotes) {
      try {
        await deleteNoteForever(note.id)
        deleted += 1
      } catch (err) {
        console.error('Keep import: failed to delete a note:', err)
      }
      setDeleteProgress((p) => ({ ...p, done: p.done + 1 }))
    }

    setDeleteResult(deleted)
    setDeleting(false)
    setDeleteProgress(null)
  }

  async function handleFiles(e) {
    const allFiles = Array.from(e.target.files || [])
    e.target.value = ''
    if (!allFiles.length) return

    const files = allFiles.filter((f) => /\.zip$/i.test(f.name))
    const ignored = allFiles.length - files.length

    setBusy(true)
    setError(null)
    setResult(null)
    setProgress(null)

    if (!files.length) {
      setBusy(false)
      setError("That doesn't look like a Keep export — pick the .zip file(s) from Google Takeout.")
      return
    }

    // Notes already imported before carry the keepId they were imported
    // with, so re-running an import (e.g. after adding new Keep notes)
    // only creates the ones that aren't here yet. This also guards across
    // the multiple zip parts Takeout splits a large export into — a note
    // won't be created twice even if two parts somehow overlapped.
    const seenKeepIds = new Set(notes.filter((n) => n.keepId).map((n) => n.keepId))
    const labelIdByName = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]))

    let imported = 0
    let skippedDuplicate = 0
    let skippedTrashed = 0
    let attachmentsSkipped = 0
    const fileErrors = []

    for (const file of files) {
      let parsed
      let zip
      try {
        const out = await parseKeepZip(file)
        parsed = out.notes
        zip = out.zip
        skippedTrashed += out.skippedTrashed
        attachmentsSkipped += out.attachmentsSkipped
      } catch (err) {
        console.error(`Keep import failed on ${file.name}:`, err)
        fileErrors.push(`${file.name}: ${err.message || 'could not be read'}`)
        continue
      }

      setProgress((p) => ({ done: 0, total: (p?.total || 0) + parsed.length }))

      for (const note of parsed) {
        if (seenKeepIds.has(note.keepId)) {
          skippedDuplicate += 1
          setProgress((p) => ({ ...p, done: p.done + 1 }))
          continue
        }

        try {
          const labelIds = []
          for (const name of note.labelNames) {
            const key = name.toLowerCase()
            let id = labelIdByName.get(key)
            if (!id) {
              id = await createLabel(name)
              if (id) labelIdByName.set(key, id)
            }
            if (id) labelIds.push(id)
          }

          // Each attachment is pulled out of the zip and uploaded one at a
          // time (not all at once), so memory use stays flat regardless of
          // how many photos a note has.
          const images = []
          const audio = []
          const noteFiles = []
          for (const att of note.attachments) {
            if (!uploadImage) {
              attachmentsSkipped += 1
              continue
            }
            try {
              const entry = zip.file(att.entryName)
              const blob = await entry.async('blob')
              const filename = att.entryName.split('/').pop()
              const attFile = new File([blob], filename, { type: att.mimetype || blob.type })
              const { url, error: uploadErr } = await uploadImage(attFile)
              if (!url) throw new Error(uploadErr || 'upload returned no URL')
              if (att.mimetype.startsWith('image/')) images.push(url)
              else if (att.mimetype.startsWith('audio/')) audio.push(url)
              else noteFiles.push({ url, name: filename, size: attFile.size, type: attFile.type })
            } catch (err) {
              console.error('Keep import: attachment upload failed:', err)
              attachmentsSkipped += 1
            }
          }

          await createNote({
            title: note.title,
            text: note.text,
            checklist: note.checklist,
            color: note.color,
            pinned: note.pinned,
            archived: note.archived,
            labels: labelIds,
            keepId: note.keepId,
            images,
            audio,
            files: noteFiles,
          })

          seenKeepIds.add(note.keepId) // guard duplicate entries within the same zip/run
          imported += 1
        } catch (err) {
          console.error('Keep import: failed to create a note:', err)
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
    }

    setResult({ imported, skippedDuplicate, skippedTrashed, attachmentsSkipped, ignored })
    if (fileErrors.length) {
      setError(
        `${fileErrors.length} of ${files.length} file${files.length === 1 ? '' : 's'} couldn't be read: ${fileErrors.join('; ')}`
      )
    }
    setBusy(false)
    setProgress(null)
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={rowStyle}>
        <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)' }}>
          Google Keep doesn't let apps sign in and sync live — but you can bring your Keep notes in
          from a Google Takeout export, and re-run this any time to pick up new ones without
          creating duplicates.
        </p>
        <ol style={{ margin: '0 0 14px', paddingLeft: 20, color: 'var(--ink-soft)' }}>
          <li>
            Go to{' '}
            <a href="https://takeout.google.com" target="_blank" rel="noreferrer">
              takeout.google.com
            </a>
          </li>
          <li>Deselect everything, then select only "Keep"</li>
          <li>
            Export, then download the file(s) — a large Keep library often comes as several
            numbered .zip parts (e.g. "-001", "-002"); select all of them at once below
          </li>
          <li>
            If the upload picker doesn't show them under "Recent", tap its menu (☰) and look in
            "Downloads" instead
          </li>
        </ol>

        <button className="pill-btn" disabled={busy} onClick={() => fileInput.current?.click()}>
          <IconImport width="16" height="16" />
          {busy ? 'Importing…' : 'Upload Keep export (.zip)'}
        </button>
        <input ref={fileInput} type="file" multiple hidden onChange={handleFiles} />

        {progress && (
          <p style={{ marginTop: 10, color: 'var(--ink-soft)' }}>
            Importing {progress.done} / {progress.total}…
          </p>
        )}

        {error && <p style={{ marginTop: 10, color: '#D33' }}>{error}</p>}

        {result && (
          <div style={{ marginTop: 14, fontSize: 14 }}>
            <div>✓ Imported {result.imported} note{result.imported === 1 ? '' : 's'}</div>
            {result.skippedDuplicate > 0 && (
              <div style={{ color: 'var(--ink-soft)' }}>
                Skipped {result.skippedDuplicate} already imported earlier
              </div>
            )}
            {result.skippedTrashed > 0 && (
              <div style={{ color: 'var(--ink-soft)' }}>
                Skipped {result.skippedTrashed} that were in Keep's trash
              </div>
            )}
            {result.attachmentsSkipped > 0 && (
              <div style={{ color: 'var(--ink-soft)' }}>
                {result.attachmentsSkipped} attachment{result.attachmentsSkipped === 1 ? '' : 's'}{' '}
                couldn't be brought over (missing from this zip part, or failed to upload)
              </div>
            )}
            {result.ignored > 0 && (
              <div style={{ color: 'var(--ink-soft)' }}>
                Ignored {result.ignored} selected file{result.ignored === 1 ? '' : 's'} that
                weren't .zip files
              </div>
            )}
          </div>
        )}
      </div>

      {importedNotes.length > 0 && (
        <div style={rowStyle}>
          <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)' }}>
            {importedNotes.length} note{importedNotes.length === 1 ? '' : 's'} in this account came
            from a Keep import. Deleting them lets you re-import from scratch — useful if you
            imported before attachments were supported and want the pictures this time.
          </p>
          <button
            className="pill-btn"
            style={{ color: '#D33' }}
            disabled={deleting}
            onClick={handleDeleteAllImported}
          >
            {deleting ? 'Deleting…' : `Delete all imported notes (${importedNotes.length})`}
          </button>

          {deleteProgress && (
            <p style={{ marginTop: 10, color: 'var(--ink-soft)' }}>
              Deleting {deleteProgress.done} / {deleteProgress.total}…
            </p>
          )}

          {deleteResult !== null && (
            <p style={{ marginTop: 10, fontSize: 14 }}>
              ✓ Deleted {deleteResult} note{deleteResult === 1 ? '' : 's'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
