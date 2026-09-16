export function keyboardRevealDelta({ fieldY, fieldHeight, keyboardY, gap }) {
  const measurements = [fieldY, fieldHeight, keyboardY, gap]
  if (!measurements.every(Number.isFinite)) return 0
  if (fieldHeight < 0 || gap < 0) return 0
  return Math.max(0, fieldY + fieldHeight - (keyboardY - gap))
}

export function shouldRevealFocusedField({ ownsFocus, horizontal, target, keyboardY }) {
  return ownsFocus === true && horizontal !== true && target != null && Number.isFinite(keyboardY)
}

export function keyboardRevealScrollPosition({ scrollX, scrollY, delta }) {
  const x = Number.isFinite(scrollX) ? scrollX : 0
  const y = Number.isFinite(scrollY) ? scrollY : 0
  const adjustment = Number.isFinite(delta) && delta > 0 ? delta : 0
  return { x, y: Math.max(0, y + adjustment), animated: true }
}

export function keyboardTopFromViewport({ viewportY, viewportHeight }) {
  if (!Number.isFinite(viewportY) || !Number.isFinite(viewportHeight) || viewportHeight < 0) return null
  return viewportY + viewportHeight
}
