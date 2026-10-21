import { useAttachmentSrc } from '../hooks/useAttachmentSrc.js'

// Drop-in <img>/<audio>/<a> that load from the on-device copy of an
// attachment when one exists (and for files still waiting to upload), so
// they work with no network.
export function AttachmentImg({ src, ...rest }) {
  const resolved = useAttachmentSrc(src)
  return <img src={resolved || undefined} {...rest} />
}
export function AttachmentAudio({ src, ...rest }) {
  const resolved = useAttachmentSrc(src)
  return <audio src={resolved || undefined} {...rest} />
}
export function AttachmentLink({ href, children, ...rest }) {
  const resolved = useAttachmentSrc(href)
  return <a href={resolved || undefined} {...rest}>{children}</a>
}
