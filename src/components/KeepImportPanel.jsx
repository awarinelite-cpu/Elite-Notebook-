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

export default function KeepImportPanel({ notes, labels, createNote, createLabel }) {
  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

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
      try {
        const out = await parseKeepZip(file)
        parsed = out.notes
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

          await createNote({
            title: note.title,
            text: note.text,
            checklist: note.checklist,
            color: note.color,
            pinned: note.pinned,
            archived: note.archived,
            labels: labelIds,
            keepId: note.keepId,
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
                Note: {result.attachmentsSkipped} image/drawing attachment
                {result.attachmentsSkipped === 1 ? '' : 's'} in Keep couldn't be brought over — only
                text and checklists are imported for now
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
    </div>
  )
}
