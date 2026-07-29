// Detects whether a doctor being swapped into a vacated published-roster
// slot already has a different shift that same day — the trigger for the
// recursive re-entrant modal (swapping them in implicitly vacates their own
// existing shift, which then needs its own open/advertise/swap decision).
export function findSameDayConflict({ entries, date, profileId, excludeEntryId }) {
  return entries.find(e => e.date === date && e.profile_id === profileId && e.id !== excludeEntryId) || null
}
