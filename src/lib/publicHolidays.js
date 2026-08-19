// `public_holidays.name` is where the "(observed)" suffix lives for a
// holiday whose day off was shifted onto another date (e.g. a Sunday
// holiday observed on the Monday — both rows exist, one plain and one
// suffixed). Splitting the suffix off lets the UI state the holiday and
// its observed/actual status separately, rather than leaving the reader
// to parse a parenthetical out of a wrapped label.
export function splitHolidayName(name) {
  const match = /^(.*?)\s*\(\s*observed\s*\)\s*$/i.exec(name ?? '')
  return match
    ? { baseName: match[1], observed: true }
    : { baseName: (name ?? '').trim(), observed: false }
}
