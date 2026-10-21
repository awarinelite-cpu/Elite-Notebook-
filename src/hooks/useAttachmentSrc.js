import { useEffect, useState } from 'react'
import { getCached, getPending, isLocalRef } from '../lib/localBlobStore.js'
import { getFsImageBlob, isFsRef } from '../lib/fsImages.js'

// Resolves an attachment reference to something an <img>/<audio>/<a> can load:
//   "local:<id>"  -> blob URL of the file still waiting to upload
//   remote URL    -> blob URL of the on-device copy if we have one, otherwise
//                    the remote URL itself (online first-view still works)
export function useAttachmentSrc(ref) {
  const [src, setSrc] = useState(isLocalRef(ref) || isFsRef(ref) ? '' : ref)
  useEffect(() => {
    let revoke = null
    let cancelled = false
    if (!ref) { setSrc(''); return }
    ;(async () => {
      try {
        const entry = isLocalRef(ref) ? (await getPending(ref))?.blob
          : isFsRef(ref) ? await getFsImageBlob(ref)
          : await getCached(ref)
        if (cancelled) return
        if (entry) { revoke = URL.createObjectURL(entry); setSrc(revoke) }
        else setSrc(isLocalRef(ref) || isFsRef(ref) ? '' : ref)
      } catch {
        if (!cancelled) setSrc(isLocalRef(ref) || isFsRef(ref) ? '' : ref)
      }
    })()
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke) }
  }, [ref])
  return src
}
