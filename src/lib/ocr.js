// tesseract.js is dynamically imported (not a static import) so its ~1MB
// bundle only downloads the first time someone actually uploads an image,
// instead of being loaded by everyone on every visit.
//
// Single shared worker, created lazily on first use and reused for every
// image after that — spinning up a fresh Tesseract worker per image would
// mean re-downloading the language data (~2-4MB) every time.
let workerPromise = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'))
  }
  return workerPromise
}

// Extracts text from an image. Accepts anything Tesseract can read directly:
// a File/Blob (fresh upload, not yet a URL) or a public https:// URL (an
// already-uploaded Storage attachment). Returns '' (never throws) on
// failure or on images with no recognizable text, so a bad/blank photo
// never blocks the rest of the upload pipeline.
export async function extractTextFromImage(source) {
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(source)
    return (data?.text || '').trim()
  } catch (err) {
    console.error('OCR failed:', err)
    return ''
  }
}

// Runs OCR on several images with limited concurrency (Tesseract workers
// are memory-heavy — running all of them at once on a phone can crash the
// tab) and reports each result back as it finishes via onResult, so the
// caller can save progressively instead of waiting for every image.
export async function extractTextFromImages(sources, onResult) {
  const CONCURRENCY = 2
  let i = 0
  async function next() {
    const idx = i++
    if (idx >= sources.length) return
    const text = await extractTextFromImage(sources[idx])
    onResult(idx, text)
    await next()
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sources.length) }, next))
}
