// Turns plain-text URLs inside a note's HTML into clickable, highlighted
// <a> tags — e.g. Google Keep's autolinking. Used both for the read-only
// note card preview and (on blur) the editable note body, so a URL looks
// and behaves the same whether you're viewing or editing a note.

// Matches http(s) URLs and bare domains (nurse-academic-main.vercel.app),
// stopping before trailing punctuation/closing brackets that are almost
// always part of the surrounding sentence, not the URL.
const URL_PATTERN =
  /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?)/gi

const TRAILING_PUNCT = /[.,;:!?)\]'"]+$/

function isLikelyUrl(candidate) {
  // Bare-domain matches (no scheme, no "www.") are the main source of false
  // positives ("e.g.", "3.5", "Node.js") — require an actual dot-TLD shape
  // AND at least one more sign it's a real host: a path, or a common TLD.
  if (/^https?:\/\//i.test(candidate) || /^www\./i.test(candidate)) return true
  const commonTlds = /\.(com|net|org|app|io|dev|co|edu|gov|ng|vercel\.app)(\/|$)/i
  return commonTlds.test(candidate)
}

function toHref(url) {
  if (/^https?:\/\//i.test(url)) return url
  return `https://${url}`
}

// Wraps URLs found in text nodes only — never touches existing <a> tags,
// element attributes, or tags themselves — so running this twice on
// already-linkified content is always safe and a no-op.
function linkifyTextNode(textNode) {
  const text = textNode.nodeValue
  URL_PATTERN.lastIndex = 0
  if (!URL_PATTERN.test(text)) return null
  URL_PATTERN.lastIndex = 0

  const frag = document.createDocumentFragment()
  let lastIndex = 0
  let match
  while ((match = URL_PATTERN.exec(text))) {
    let raw = match[0]
    const start = match.index
    // Peel off trailing punctuation like "check nurse-academic-main.vercel.app."
    // so the period ends the sentence, not the link.
    const trailingMatch = raw.match(TRAILING_PUNCT)
    if (trailingMatch) raw = raw.slice(0, raw.length - trailingMatch[0].length)
    if (!raw || !isLikelyUrl(raw)) continue

    if (start > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, start)))
    const a = document.createElement('a')
    a.href = toHref(raw)
    a.textContent = raw
    a.className = 'note-link'
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    frag.appendChild(a)
    lastIndex = start + raw.length
  }
  if (lastIndex === 0) return null // nothing actually qualified as a URL
  if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)))
  return frag
}

function linkifyNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const frag = linkifyTextNode(node)
    if (frag) node.replaceWith(frag)
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  if (node.tagName === 'A') return // already a link — leave it alone
  // Snapshot children first: replaceWith() above would otherwise disrupt
  // a live childNodes list while we're still iterating it.
  Array.from(node.childNodes).forEach(linkifyNode)
}

// Takes a note's stored HTML string, returns a new HTML string with plain
// URLs wrapped in <a class="note-link">. Safe to call on content that's
// already (partially) linkified.
export function linkifyHtml(html) {
  if (!html) return html
  const container = document.createElement('div')
  container.innerHTML = html
  Array.from(container.childNodes).forEach(linkifyNode)
  return container.innerHTML
}
