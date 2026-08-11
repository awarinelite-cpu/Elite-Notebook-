// Thin wrappers around the Drive v3 REST API. Every function takes an
// explicit access token (rather than reading one from context) so the
// same helpers work for both the active account and, during copy/move,
// whichever account is the source or destination.

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'

export const LIST_FIELDS =
  'files(id,name,mimeType,iconLink,thumbnailLink,modifiedTime,webViewLink,size,folderColorRgb,parents),nextPageToken'
const ITEM_FIELDS = 'id,name,mimeType,iconLink,thumbnailLink,modifiedTime,webViewLink,size,folderColorRgb,parents'

// Google Docs/Sheets/Slides/Drawings only exist inside Google's own format
// and have no bytes of their own — `alt=media` doesn't work on them. To
// move one to a different Drive account (which can't just reuse the same
// file id) it has to be exported to a normal file format first.
const EXPORT_MIME = {
  'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.google-apps.drawing': 'image/png',
}
const EXPORT_EXT = {
  'application/vnd.google-apps.document': '.docx',
  'application/vnd.google-apps.spreadsheet': '.xlsx',
  'application/vnd.google-apps.presentation': '.pptx',
  'application/vnd.google-apps.drawing': '.png',
}

async function asJsonOrThrow(res) {
  if (res.ok) return res.json()
  const body = await res.json().catch(() => null)
  const err = new Error(body?.error?.message || `HTTP ${res.status}`)
  err.status = res.status
  throw err
}

export async function listFiles(token, { query, parentId, pageToken } = {}) {
  const clauses = ['trashed = false']
  if (query) clauses.push(`name contains '${query.replace(/'/g, "\\'")}'`)
  else clauses.push(parentId ? `'${parentId}' in parents` : `'root' in parents`)
  const params = new URLSearchParams({
    pageSize: '50',
    fields: LIST_FIELDS,
    orderBy: 'folder,modifiedTime desc',
    q: clauses.join(' and '),
  })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    const err = new Error('unauthorized')
    err.status = 401
    throw err
  }
  return asJsonOrThrow(res)
}

// Folders only — used by the destination picker, which only needs to show
// navigable folders, not every file.
export async function listFolders(token, parentId) {
  const clauses = ['trashed = false', `mimeType = '${FOLDER_MIME}'`]
  clauses.push(parentId ? `'${parentId}' in parents` : `'root' in parents`)
  const params = new URLSearchParams({
    pageSize: '100',
    fields: LIST_FIELDS,
    orderBy: 'name',
    q: clauses.join(' and '),
  })
  const res = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    const err = new Error('unauthorized')
    err.status = 401
    throw err
  }
  const data = await asJsonOrThrow(res)
  return data.files || []
}

export async function createFolder(token, name, parentId) {
  const res = await fetch(`${FILES_ENDPOINT}?fields=${ITEM_FIELDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
  })
  return asJsonOrThrow(res)
}

export async function uploadFile(token, file, parentId, name) {
  const metadata = { name: name || file.name, parents: parentId ? [parentId] : undefined }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', file)
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${ITEM_FIELDS}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  )
  return asJsonOrThrow(res)
}

// Same-account copy of a single file — Drive does this server-side, so it's
// instant and doesn't need the file's bytes to pass through the browser.
// (Drive's copy endpoint doesn't work on folders — those go through
// createFolder + recursive per-child copy instead.)
export async function copyFileInPlace(token, fileId, { name, parentId } = {}) {
  const res = await fetch(`${FILES_ENDPOINT}/${fileId}/copy?fields=${ITEM_FIELDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: parentId ? [parentId] : undefined }),
  })
  return asJsonOrThrow(res)
}

// Same-account move — just reparenting. Works for folders too (their
// contents move with them; Drive doesn't need them touched individually).
export async function moveInPlace(token, fileId, { addParentId, removeParentId }) {
  const params = new URLSearchParams({ fields: ITEM_FIELDS })
  if (addParentId) params.set('addParents', addParentId)
  if (removeParentId) params.set('removeParents', removeParentId)
  const res = await fetch(`${FILES_ENDPOINT}/${fileId}?${params.toString()}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return asJsonOrThrow(res)
}

export async function trashFile(token, fileId) {
  const res = await fetch(`${FILES_ENDPOINT}/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  return asJsonOrThrow(res)
}

// Downloads a regular file's bytes, or exports a Google Docs/Sheets/Slides/
// Drawing file to a normal format first. Returns { blob, name } ready to
// hand to uploadFile on a different account. Returns null if the file type
// can't be exported (e.g. Google Forms, Sites — these have no meaningful
// standalone file representation).
export async function downloadForTransfer(token, file) {
  const exportMime = EXPORT_MIME[file.mimeType]
  if (file.mimeType.startsWith('application/vnd.google-apps.') && !exportMime) {
    return null
  }
  const url = exportMime
    ? `${FILES_ENDPOINT}/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `${FILES_ENDPOINT}/${file.id}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  const blob = await res.blob()
  const name = exportMime ? file.name + (EXPORT_EXT[file.mimeType] || '') : file.name
  return { blob, name }
}
