export const FEEDBACK_EMAIL = 'tyler@tourbillionenergy.com'

const FEEDBACK_COPY = Object.freeze({
  bug: {
    subject: 'SideFlip Bug Report',
    prompt: 'Please describe what happened:',
  },
  suggestion: {
    subject: 'SideFlip Suggestion',
    prompt: 'Please share your suggestion:',
  },
})

function boundedContext(value) {
  return String(value || 'unknown').replace(/[\r\n\u0000-\u001f\u007f]/g, '').slice(0, 40) || 'unknown'
}

export function buildFeedbackMailto(kind, platform, version) {
  const copy = FEEDBACK_COPY[kind]
  if (!copy) throw new Error('Unsupported feedback kind')
  const body = `${copy.prompt}\n\n\n---\nApp version: ${boundedContext(version)}\nPlatform: ${boundedContext(platform)}`
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(body)}`
}
