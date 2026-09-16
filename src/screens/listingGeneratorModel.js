const STYLES = new Set(['professional', 'normal', 'funny'])
const HUMOR_LEVELS = new Set(['subtle', 'balanced', 'unhinged'])

export function normalizeListingSelection(style, humorLevel) {
  const normalizedStyle = typeof style === 'string' ? style.trim().toLowerCase() : ''
  if (!STYLES.has(normalizedStyle)) throw new Error('Choose a valid description style.')
  if (normalizedStyle !== 'funny') return { style: normalizedStyle, humorLevel: null }
  const normalizedHumor = humorLevel == null || String(humorLevel).trim() === ''
    ? 'balanced'
    : String(humorLevel).trim().toLowerCase()
  if (!HUMOR_LEVELS.has(normalizedHumor)) throw new Error('Choose a valid humor level.')
  return { style: normalizedStyle, humorLevel: normalizedHumor }
}

export function createDescriptionRequest(projectId, style, humorLevel, existingDescription = '', sellerBrief = '') {
  if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project information is missing.')
  const selection = normalizeListingSelection(style, humorLevel)
  const boundedDescription = typeof existingDescription === 'string' ? existingDescription.trim().slice(0, 4000) : ''
  const boundedBrief = typeof sellerBrief === 'string' ? sellerBrief.trim().slice(0, 2000) : ''
  return {
    projectId: projectId.trim(),
    style: selection.style,
    ...(selection.humorLevel ? { humorLevel: selection.humorLevel } : {}),
    ...(boundedDescription ? { existingDescription: boundedDescription } : {}),
    ...(boundedBrief ? { sellerBrief: boundedBrief } : {}),
  }
}

export function needsDescriptionPreview(description) {
  return typeof description === 'string' && description.trim().length > 0
}
