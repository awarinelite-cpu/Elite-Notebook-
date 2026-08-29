// Standard "four-point transform": given the four corners a user dragged
// onto a photographed document (which is a skewed quadrilateral because the
// camera wasn't held perfectly flat/square-on), produces a flat rectangular
// image as if the document had been scanned straight-on. This is the same
// technique CamScanner and similar apps use — perspective correction via a
// homography, not just a crop.

function solve8x8(A, b) {
  // Gaussian elimination with partial pivoting on an 8-equation system.
  const n = 8
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    const pv = M[col][col]
    if (Math.abs(pv) < 1e-12) continue // degenerate (shouldn't happen for 4 distinct corners)
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col] / pv
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1))
}

// Returns the 3x3 homography (row-major, h[8]=1) mapping each `from[i]` to
// `to[i]` for i in 0..3.
function getHomography(from, to) {
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = from[i]
    const { x: dx, y: dy } = to[i]
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy])
    b.push(dx)
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy])
    b.push(dy)
  }
  const h = solve8x8(A, b)
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

function applyH(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8]
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }

// corners: { tl, tr, br, bl }, each { x, y } in sourceCanvas pixel space.
// Returns a new canvas containing the flattened, straightened document.
export function warpToRectangle(sourceCanvas, corners) {
  const { tl, tr, br, bl } = corners
  const widthTop = dist(tl, tr)
  const widthBottom = dist(bl, br)
  const heightLeft = dist(tl, bl)
  const heightRight = dist(tr, br)
  const outW = Math.max(1, Math.round(Math.max(widthTop, widthBottom)))
  const outH = Math.max(1, Math.round(Math.max(heightLeft, heightRight)))

  const rect = [
    { x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 },
  ]
  // Maps a point in the *output* rectangle to where it came from in the
  // *source* photo — that's the direction we need for sampling below.
  const h = getHomography(rect, [tl, tr, br, bl])

  const srcCtx = sourceCanvas.getContext('2d')
  const src = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const sW = sourceCanvas.width, sH = sourceCanvas.height

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const outCtx = out.getContext('2d')
  const dstImg = outCtx.createImageData(outW, outH)

  function sample(x, y) {
    // Bilinear sample; out-of-bounds reads clamp to the edge pixel rather
    // than going transparent, so a slightly-off corner drag doesn't leave a
    // black/transparent sliver along that edge.
    const x0 = Math.max(0, Math.min(sW - 1, Math.floor(x)))
    const y0 = Math.max(0, Math.min(sH - 1, Math.floor(y)))
    const x1 = Math.min(sW - 1, x0 + 1)
    const y1 = Math.min(sH - 1, y0 + 1)
    const fx = Math.min(1, Math.max(0, x - x0))
    const fy = Math.min(1, Math.max(0, y - y0))
    const idx = (xx, yy) => (yy * sW + xx) * 4
    const out4 = [0, 0, 0, 0]
    for (let c = 0; c < 4; c++) {
      const v00 = src.data[idx(x0, y0) + c]
      const v10 = src.data[idx(x1, y0) + c]
      const v01 = src.data[idx(x0, y1) + c]
      const v11 = src.data[idx(x1, y1) + c]
      const top = v00 + (v10 - v00) * fx
      const bot = v01 + (v11 - v01) * fx
      out4[c] = top + (bot - top) * fy
    }
    return out4
  }

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const { x: sx, y: sy } = applyH(h, x, y)
      const [r, g, b, a] = sample(sx, sy)
      const di = (y * outW + x) * 4
      dstImg.data[di] = r
      dstImg.data[di + 1] = g
      dstImg.data[di + 2] = b
      dstImg.data[di + 3] = a
    }
  }
  outCtx.putImageData(dstImg, 0, 0)
  return out
}
