import { useState } from 'react'
import { useAttachmentSrc } from '../hooks/useAttachmentSrc.js'

// Drop-in <img>/<audio>/<a> that load from the on-device copy of an
// attachment when one exists (and for files still waiting to upload), so
// they work with no network.
export function AttachmentImg({ src, onError, ...rest }) {
  const resolved = useAttachmentSrc(src)
  const [failed, setFailed] = useState(null)
  // Show a visible placeholder (instead of a browser broken-image icon) and
  // log the failing URL so the cause can be diagnosed.
  if (failed && failed === resolved) {
    return <div className="attachment-missing" title="Image could not be loaded">Image unavailable</div>
  }
  return (
    <img
      src={resolved || undefined}
      onError={(e) => { console.warn('Attachment failed to load:', resolved); setFailed(resolved); onError?.(e) }}
      {...rest}
    />
  )
}
export function AttachmentAudio({ src, ...rest }) {
  const resolved = useAttachmentSrc(src)
  return <audio src={resolved || undefined} {...rest} />
}
export function AttachmentLink({ href, children, ...rest }) {
  const resolved = useAttachmentSrc(href)
  return <a href={resolved || undefined} {...rest}>{children}</a>
}
