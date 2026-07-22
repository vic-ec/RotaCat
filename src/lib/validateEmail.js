// Lightweight client-side check for inline form feedback — not a substitute
// for server-side validation, just enough to catch obvious typos before
// submit rather than relying solely on the browser's native tooltip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(value)
}
