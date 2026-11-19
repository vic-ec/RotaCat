import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import {
  describeJob, isJobActive, isJobStale, jobToEngineResult, jobFailureDetail, STALE_AFTER_MINUTES,
  generationRunsToShow,
} from './rosterGeneration'

const NOW = new Date('2026-11-15T10:00:00Z').getTime()
const minutesAgo = m => new Date(NOW - m * 60000).toISOString()

describe('roster generation job helpers', () => {
  it('treats queued and running as active, finished states as not', () => {
    expect(isJobActive({ status: 'queued' })).toBe(true)
    expect(isJobActive({ status: 'running' })).toBe(true)
    expect(isJobActive({ status: 'succeeded' })).toBe(false)
    expect(isJobActive({ status: 'failed' })).toBe(false)
    expect(isJobActive(null)).toBe(false)
  })

  it('only calls an active job stale once it is past the limit', () => {
    expect(isJobStale({ status: 'running', created_at: minutesAgo(STALE_AFTER_MINUTES - 1) }, NOW)).toBe(false)
    expect(isJobStale({ status: 'running', created_at: minutesAgo(STALE_AFTER_MINUTES + 1) }, NOW)).toBe(true)
    expect(isJobStale({ status: 'succeeded', created_at: minutesAgo(500) }, NOW)).toBe(false)
  })

  it('describes each phase', () => {
    expect(describeJob(null).phase).toBe('none')
    expect(describeJob({ status: 'queued', created_at: minutesAgo(0) }, NOW).detail).toContain('less than a minute ago')
    const running = describeJob({ status: 'running', created_at: minutesAgo(4), started_at: minutesAgo(3) }, NOW)
    expect(running.phase).toBe('running')
    expect(running.detail).toContain('3 minutes ago')
    expect(describeJob({ status: 'succeeded', message: 'done' }, NOW)).toMatchObject({ phase: 'succeeded', detail: 'done' })
    expect(describeJob({ status: 'failed', message: 'boom' }, NOW)).toMatchObject({ phase: 'failed', detail: 'boom' })
  })

  it('reports a stale active job as failed', () => {
    const d = describeJob({ status: 'queued', created_at: minutesAgo(45) }, NOW)
    expect(d.phase).toBe('failed')
    expect(d.title).toBe('The run stopped responding')
  })

  it('reshapes the runner summary into the engine result the report reads', () => {
    const job = { summary: { status: 'FEASIBLE', entries_written: 363, flags: { total_entries: 363, total_locums_needed: 6, weekend_planner_missed: [] } } }
    expect(jobToEngineResult(job)).toEqual({
      status: 'FEASIBLE',
      entries_written: 363,
      summary: { total_entries: 363, total_locums_needed: 6, weekend_planner_missed: [] },
    })
    expect(jobToEngineResult({})).toEqual({ status: null, entries_written: null, summary: {} })
  })

  it('assembles the technical failure detail', () => {
    const detail = jobFailureDetail({
      id: 'j1', status: 'failed', created_at: minutesAgo(5),
      error_detail: 'Status: LOAD_FAILED\n\nTraceback…',
      summary: { validator_failures: [{ rule: 'HC-04', title: 'Night blocks', violation_count: 2 }] },
    }, NOW)
    expect(detail).toContain('LOAD_FAILED')
    expect(detail).toContain('HC-04 Night blocks — 2 violation(s)')
    expect(jobFailureDetail({ id: 'j2', status: 'running', created_at: minutesAgo(40) }, NOW)).toContain('40 minutes after')
    expect(jobFailureDetail(null)).toBe('')
  })

  it('lists only the newest run per month, when it is active or failed', () => {
    const jobs = [
      { id: 'oct-old', year: 2026, month: 10, status: 'failed', created_at: minutesAgo(30) },
      { id: 'oct-new', year: 2026, month: 10, status: 'failed', created_at: minutesAgo(5) },
      { id: 'dec', year: 2026, month: 12, status: 'running', created_at: minutesAgo(2), started_at: minutesAgo(1) },
      { id: 'nov-fail', year: 2026, month: 11, status: 'failed', created_at: minutesAgo(90) },
      { id: 'nov-ok', year: 2026, month: 11, status: 'succeeded', created_at: minutesAgo(20) },
      { id: 'sep-dry', year: 2026, month: 9, status: 'failed', created_at: minutesAgo(3), summary: { dry_run: true } },
      { id: 'aug-stale', year: 2026, month: 8, status: 'queued', created_at: minutesAgo(50) },
    ]
    expect(generationRunsToShow(jobs, { now: NOW }).map(j => j.id)).toEqual(['aug-stale', 'oct-new', 'dec'])
    expect(generationRunsToShow(jobs, { now: NOW, dismissedIds: ['oct-new', 'aug-stale'] }).map(j => j.id)).toEqual(['dec'])
  })
})
