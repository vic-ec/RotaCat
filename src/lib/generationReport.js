// The scheduling engine's own account of a generation run, kept so the
// roster page can show it. The engine returns it once, in the response to
// POST /generate-roster (RotaCatScheduler app/main.py: status, summary) —
// it is not stored anywhere server-side, and the Generate page used to
// navigate away and drop it. Kept per roster in localStorage: it survives a
// reload and a return visit on this device, and is simply absent anywhere
// else (the page shows nothing rather than a guess).

const KEY = id => `rotacat:generationReport:${id}`

export function saveGenerationReport(rosterMonthId, result, { excludedCount = 0 } = {}) {
  if (!rosterMonthId || !result) return
  const report = {
    status: result.status,
    entriesWritten: result.entries_written ?? null,
    summary: result.summary || {},
    excludedCount,
    savedAt: new Date().toISOString(),
  }
  try { localStorage.setItem(KEY(rosterMonthId), JSON.stringify(report)) } catch { /* storage full or blocked — the report just isn't kept */ }
}

export function readGenerationReport(rosterMonthId) {
  try {
    const raw = localStorage.getItem(KEY(rosterMonthId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Whether the report describes the draft currently on screen. A later run
// from another device (or any regeneration that didn't save a report here)
// rewrites every entry, so a report saved well before the draft's entries
// were written belongs to an older run. Two minutes of slack covers the gap
// between the engine writing entries and the browser saving the response.
export function reportMatchesDraft(report, rosterEntries) {
  if (!report?.savedAt) return false
  const generatedAt = rosterEntries.map(e => e.created_at).filter(Boolean).sort()[0]
  if (!generatedAt) return true
  return new Date(report.savedAt).getTime() >= new Date(generatedAt).getTime() - 120000
}

// OPTIMAL: the engine proved nothing better exists. FEASIBLE: it stopped at
// its time limit with the best roster found so far — a better one may exist.
export function generationOutcome(status) {
  if (status === 'OPTIMAL') {
    return { tone: 'success', title: 'Best possible roster found', detail: 'The engine finished and confirmed no better roster exists for these inputs.' }
  }
  if (status === 'FEASIBLE') {
    return { tone: 'warning', title: 'Stopped at the time limit', detail: 'This is the best roster found in the time allowed. A better one may exist — generating again can give a different result.' }
  }
  return { tone: 'neutral', title: `Engine status: ${status || 'unknown'}`, detail: '' }
}

// Plain-language labels for the engine's flag types; anything new falls
// back to its own name with underscores opened up.
const FLAG_LABELS = {
  understaffed: 'Shifts below minimum staffing',
  psych_coverage: 'Psych cover missing',
  psych_fallback: 'Psych cover by fallback',
}
export function flagTypeLabel(type) {
  return FLAG_LABELS[type] || String(type || 'Other').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}
