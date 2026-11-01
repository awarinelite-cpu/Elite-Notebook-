import { useState } from 'react'
import { linkDisplay } from '../lib/linkify.js'
import { IconExternal, IconGlobe } from './Icons.jsx'

const MAX_ROWS = 3

function LinkChip({ url }) {
  const { host, title } = linkDisplay(url)
  const [iconFailed, setIconFailed] = useState(false)
  return (
    <a
      className="link-chip"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="link-chip-thumb">
        {iconFailed ? (
          <IconGlobe width="24" height="24" />
        ) : (
          <img
            src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setIconFailed(true)}
          />
        )}
      </span>
      <span className="link-chip-text">
        <span className="link-chip-title">{title}</span>
        <span className="link-chip-host">{host}</span>
      </span>
      <IconExternal className="link-chip-open" width="16" height="16" />
    </a>
  )
}

// Link rows pinned to the bottom of a note card, like Google Keep: the first
// few links as tappable rows, then "+N more" (tapping that opens the note).
export default function LinkChips({ urls }) {
  if (!urls.length) return null
  const shown = urls.slice(0, MAX_ROWS)
  const extra = urls.length - shown.length
  return (
    <div className="link-chips">
      {shown.map((url) => <LinkChip key={url} url={url} />)}
      {extra > 0 && <div className="link-chips-more">+{extra} more</div>}
    </div>
  )
}
