// MS Teams deep links, keyed by email — Microsoft's own documented format
// (https://learn.microsoft.com/microsoftteams/platform/concepts/build-and-test/deep-link-teams).
// Opens the Teams desktop/mobile app if installed, otherwise falls back to
// teams.microsoft.com in a browser tab. Mirrors the null-when-absent
// contract of the phone.js helpers so callers can branch on it the same way.
export function msTeamsChatHref(email) {
  if (!email) return null
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`
}

export function msTeamsCallHref(email) {
  if (!email) return null
  return `https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(email)}`
}
