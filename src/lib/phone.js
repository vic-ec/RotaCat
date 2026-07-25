// Formats a stored SA local number (raw 10 digits, e.g. "0821122335") for
// display. Anything that isn't exactly 10 digits once non-digit characters
// are stripped is shown unchanged rather than forcing a broken format onto it.
export function formatPhoneDisplay(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 10) return phone
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// Formats raw digits as the user types, so a number in progress reads as
// (082) 553-6646 the whole way through rather than jumping from plain
// digits to the final format only once all 10 are in. Mirrors iOS Contacts'
// own live-formatting behaviour for phone fields.
export function formatPhoneProgressive(digits) {
  if (!digits) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

// Raw digit string for use in a tel: href — tel: links ignore formatting
// punctuation anyway, but stripping keeps it consistent everywhere.
export function phoneTelHref(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return `tel:${digits || phone}`
}

// sms: is the standard scheme for opening the device's default messaging
// app with a recipient pre-filled — same digit-stripping as tel:.
export function phoneSmsHref(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return `sms:${digits || phone}`
}

// WhatsApp's click-to-chat API needs a full international number with no
// leading zero — stored numbers are local SA format (leading 0), so swap it
// for the country code rather than requiring a separate international field.
export function phoneWhatsAppHref(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('0') ? `27${digits.slice(1)}` : digits
  return `https://wa.me/${intl}`
}
