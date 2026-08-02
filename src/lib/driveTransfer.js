import { FOLDER_MIME, listFiles, createFolder, uploadFile, copyFileInPlace, moveInPlace, trashFile, downloadForTransfer } from './driveApi.js'

// Copies `item` (a file or folder) into `destParentId` on the destination
// account. When source and destination are the same account, Drive does
// the heavy lifting server-side for files; folders always need to be
// walked manually since Drive's copy endpoint doesn't recurse.
async function copyItem({ item, sourceToken, destToken, destParentId, sameAccount, onSkip }) {
  if (item.mimeType === FOLDER_MIME) {
    const newFolder = await createFolder(destToken, item.name, destParentId)
    let pageToken
    do {
      const page = await listFiles(sourceToken, { parentId: item.id, pageToken })
      for (const child of page.files || []) {
        await copyItem({ item: child, sourceToken, destToken, destParentId: newFolder.id, sameAccount, onSkip })
      }
      pageToken = page.nextPageToken
    } while (pageToken)
    return newFolder
  }

  if (sameAccount) {
    return copyFileInPlace(sourceToken, item.id, { name: item.name, parentId: destParentId })
  }

  // Cross-account: no server-side copy is possible (the destination
  // account has no access to the source file), so the bytes have to pass
  // through the browser.
  const payload = await downloadForTransfer(sourceToken, item)
  if (!payload) {
    onSkip?.(item)
    return null
  }
  return uploadFile(destToken, payload.blob, destParentId, payload.name)
}

// Moves `item` into `destParentId`. Same-account moves are a cheap
// reparent (including for folders, whose contents travel with them
// automatically). Cross-account moves have to copy the content over and
// then remove the original, since there's no "move" between two separate
// Drive accounts.
async function moveItem({ item, sourceToken, destToken, destParentId, sourceParentId, sameAccount, onSkip }) {
  if (sameAccount) {
    // Prefer the item's own recorded parent(s) over the folder we happened
    // to be browsing — matters for items picked from search results, which
    // aren't necessarily inside the currently open folder.
    const removeParentId = item.parents?.length ? item.parents.join(',') : sourceParentId
    return moveInPlace(sourceToken, item.id, { addParentId: destParentId, removeParentId })
  }
  const copied = await copyItem({ item, sourceToken, destToken, destParentId, sameAccount, onSkip })
  if (copied) await trashFile(sourceToken, item.id)
  return copied
}

// Runs copy or move for a batch of items, tolerating individual failures so
// one bad file doesn't abort the rest. Returns a summary the UI can turn
// into a toast: how many succeeded, how many failed, and which (if any)
// were skipped because they can't be represented outside their original
// Google Doc/Sheet/Slide format.
export async function transferItems({ items, mode, sourceToken, destToken, destParentId, sourceParentId, sameAccount }) {
  let succeeded = 0
  const failed = []
  const skipped = []
  const onSkip = (item) => skipped.push(item.name)

  for (const item of items) {
    try {
      if (mode === 'copy') {
        await copyItem({ item, sourceToken, destToken, destParentId, sameAccount, onSkip })
      } else {
        await moveItem({ item, sourceToken, destToken, destParentId, sourceParentId, sameAccount, onSkip })
      }
      succeeded++
    } catch (err) {
      failed.push({ name: item.name, message: err.message })
    }
  }

  return { succeeded, failed, skipped, total: items.length }
}
