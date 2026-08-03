// Notes are stored with lightweight HTML formatting (bold/italic/underline/lists)
// produced by the note editor's formatting toolbar. These helpers convert that
// HTML back to plain text for contexts that need it - search matching, sharing,
// and any legacy plain-text note whose content never had HTML tags to begin with.

let scratch = null

export function stripHtml(html) {
  if (!html) return ''
  if (!scratch) scratch = document.createElement('div')
  scratch.innerHTML = html
  return scratch.textContent || scratch.innerText || ''
}

// A note's `text` field predates rich formatting for old notes, so it may be
// plain text with no tags at all. Either way, rendering it as HTML is safe:
// plain text with no `<`/`>` just passes through unchanged.
export function isRichText(text) {
  return typeof text === 'string' && /<[a-z][\s\S]*>/i.test(text)
}
