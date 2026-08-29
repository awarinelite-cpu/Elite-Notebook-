// Post-warp document filters, applied to a flattened scan. These read from
// `srcCanvas` (the perspective-corrected color scan — never mutated, so
// switching filters back and forth stays lossless) and paint the result
// into `outCanvas` (sized to match, reused as the visible preview).

export function applyScanFilter(srcCanvas, outCanvas, mode, threshold = 150) {
  outCanvas.width = srcCanvas.width
  outCanvas.height = srcCanvas.height
  const outCtx = outCanvas.getContext('2d')

  if (mode === 'original') {
    outCtx.drawImage(srcCanvas, 0, 0)
    return
  }

  const srcCtx = srcCanvas.getContext('2d')
  const img = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
  const d = img.data

  if (mode === 'enhance') {
    // Per-channel min/max contrast stretch — the classic "brighten the page,
    // deepen the ink" scanner look, without altering hue balance.
    let min = [255, 255, 255], max = [0, 0, 0]
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = d[i + c]
        if (v < min[c]) min[c] = v
        if (v > max[c]) max[c] = v
      }
    }
    const range = min.map((m, c) => Math.max(1, max[c] - m))
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        d[i + c] = Math.max(0, Math.min(255, ((d[i + c] - min[c]) / range[c]) * 255))
      }
    }
  } else if (mode === 'gray') {
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      d[i] = d[i + 1] = d[i + 2] = lum
    }
  } else if (mode === 'bw') {
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const v = lum > threshold ? 255 : 0
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
  outCtx.putImageData(img, 0, 0)
}
