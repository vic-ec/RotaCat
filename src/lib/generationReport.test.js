import { describe, it, expect, beforeEach } from 'vitest'
import { saveGenerationReport, readGenerationReport, reportMatchesDraft, generationOutcome, flagTypeLabel } from './generationReport'

describe('generationReport', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips the engine response per roster', () => {
    saveGenerationReport('r1', { status: 'FEASIBLE', entries_written: 400, summary: { total_locums_needed: 12 } }, { excludedCount: 2 })
    const report = readGenerationReport('r1')
    expect(report.status).toBe('FEASIBLE')
    expect(report.entriesWritten).toBe(400)
    expect(report.summary.total_locums_needed).toBe(12)
    expect(report.excludedCount).toBe(2)
    expect(readGenerationReport('other')).toBeNull()
  })

  it('survives unreadable storage', () => {
    localStorage.setItem('rotacat:generationReport:r1', '{not json')
    expect(readGenerationReport('r1')).toBeNull()
  })

  it('tells a report for this draft from one for an older run', () => {
    const entries = [{ created_at: '2026-11-15T08:17:04Z' }]
    expect(reportMatchesDraft({ savedAt: '2026-11-15T08:17:06Z' }, entries)).toBe(true)
    // saved a day before these entries were written — an older run's report
    expect(reportMatchesDraft({ savedAt: '2026-11-14T08:00:00Z' }, entries)).toBe(false)
    expect(reportMatchesDraft(null, entries)).toBe(false)
  })

  it('words the two successful outcomes differently', () => {
    expect(generationOutcome('OPTIMAL').tone).toBe('success')
    expect(generationOutcome('FEASIBLE').title).toMatch(/time limit/)
  })

  it('labels known flag types and opens up unknown ones', () => {
    expect(flagTypeLabel('understaffed')).toBe('Shifts below minimum staffing')
    expect(flagTypeLabel('night_block_gap')).toBe('Night block gap')
  })
})
