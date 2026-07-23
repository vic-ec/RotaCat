// Formats a stored SA local number (raw 10 digits, e.g. "0821122335") for
// display. Anything that isn't exactly 10 digits once non-digit characters
// are stripped is shown unchanged rather than forcing a broken format onto it.
export function formatPhoneDisplay(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 10) return phone
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// Raw digit string for use in a tel: href — tel: links ignore formatting
// punctuation anyway, but stripping keeps it consistent everywhere.
export function phoneTelHref(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return `tel:${digits || phone}`
}
