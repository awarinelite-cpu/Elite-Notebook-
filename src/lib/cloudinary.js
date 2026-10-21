// Picture hosting on Cloudinary (free). The photo is shrunk on the phone,
// uploaded with an *unsigned* upload preset (no secret key in the app), and
// only the returned https link is saved on the note — same approach as the
// Shoppers Mall app. Cloud name + preset come from Settings (stored on this
// device) or, as a default, from VITE_CLOUDINARY_* env vars.

const LS_KEY = 'elite-cloudinary'

export class RetryLater extends Error {}

export function getCloudinaryConfig() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { /* ignore */ }
  const cloud = (saved.cloud || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim()
  const preset = (saved.preset || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim()
  return cloud && preset ? { cloud, preset } : null
}

export function saveCloudinaryConfig(cloud, preset) {
  localStorage.setItem(LS_KEY, JSON.stringify({ cloud: cloud.trim(), preset: preset.trim() }))
}

export function readSavedCloudinaryConfig() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

export const isCloudinaryUrl = (u) =>
  typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(u)

// size = square thumbnail in px; null = screen-sized version. Other hosts'
// links are returned untouched.
export function cloudinarySrc(url, size) {
  if (!isCloudinaryUrl(url)) return url
  const t = size ? `w_${size},h_${size},c_fill,q_auto,f_auto` : 'w_1200,c_limit,q_auto,f_auto'
  return url.replace('/image/upload/', `/image/upload/${t}/`)
}

// Scale the longest side down to `max` px. Small files pass through as-is.
async function shrinkImage(file, max = 1600, quality = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  let bmp
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { return file }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  if (k === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close?.(); return file }
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  const ctx = c.getContext('2d')
  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  if (outType === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) }
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  const blob = await new Promise((res) => c.toBlob(res, outType, quality))
  return blob || file
}

// Resolves to the hosted https link. Throws RetryLater when offline / the
// service is busy (caller keeps the file and tries again later); any other
// Error carries Cloudinary's message.
export async function uploadToCloudinary(file) {
  const cfg = getCloudinaryConfig()
  if (!cfg) throw new Error('Cloudinary is not set up.')
  const small = await shrinkImage(file)
  const body = new FormData()
  body.append('file', small, file.name || 'image')
  body.append('upload_preset', cfg.preset)
  let r
  try {
    r = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloud)}/image/upload`, { method: 'POST', body })
  } catch { throw new RetryLater('offline') }
  const j = await r.json().catch(() => ({}))
  if (r.status >= 500 || r.status === 429) throw new RetryLater('busy')
  if (!r.ok) throw new Error('Cloudinary refused the photo: ' + (j?.error?.message ?? 'error ' + r.status))
  if (!j.secure_url) throw new Error('Cloudinary did not return a link for the photo.')
  return String(j.secure_url)
}
