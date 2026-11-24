import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OnShiftPanel from './OnShiftPanel'

function setViewport(desktop) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })
}

const fetchOnShiftBoard = vi.hoisted(() => vi.fn())
vi.mock('../lib/onShiftBoard', async () => ({ ...(await vi.importActual('../lib/onShiftBoard')), fetchOnShiftBoard }))

const doctor = (key, name, surname, extra = {}) => ({ key, kind: 'doctor', profile: { name, surname, color_code: '#0F766E' }, initials: `${name[0]}${surname[0]}`, name: `${name} ${surname}`, meta: 'MO', label: `${name} ${surname} · MO`, late: false, ...extra })
const group = (startTime, endTime, people, extra = {}) => ({
  key: startTime, startTime, endTime, night: false, people,
  start: new Date(`2026-11-24T${startTime}`), end: new Date(`2026-11-24T${endTime}`), ...extra,
})

describe('OnShiftPanel — phone', () => {
  beforeEach(() => {
    setViewport(false)
    vi.setSystemTime(new Date(2026, 10, 24, 14, 30))
    fetchOnShiftBoard.mockReset().mockResolvedValue({
      now: [
        group('08:00:00', '18:00:00', [
          doctor('a', 'Maurice', 'Mokoena'),
          doctor('b', 'Zara', 'Khan', { late: true }),
          { key: 'c', kind: 'locum', initials: 'DS', name: 'Dr Smith', meta: 'Locum · covering Naledi Dlamini', label: 'Dr Smith · Locum · covering Naledi Dlamini', late: false },
        ]),
        group('12:00:00', '22:00:00', [{ key: 'd', kind: 'open', initials: '[ ]', name: 'Open locum slot', meta: 'Not covered', label: 'Open locum slot · not covered', late: false }]),
      ],
      next: [group('15:00:00', '01:00:00', [doctor('e', 'Tom', 'Petersen')])],
      consultant: 'Kate Meyer',
    })
  })

  it('shows full names in two columns on a phone too, with no badges to tap', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    const groups = await screen.findAllByTestId('on-shift-group')
    expect(groups).toHaveLength(3)
    expect(groups[0].textContent).toMatch(/Now08h00–18h00.*Maurice MokoenaMO.*Zara KhanMO.*Dr SmithLocum · covering Naledi Dlamini/)
    expect(groups[1].textContent).toMatch(/Now12h00–22h00.*Open locum slotNot covered/)
    expect(groups[2].textContent).toMatch(/Next · in 30 min15h00–01h00.*Tom PetersenMO/)
    expect(within(groups[0]).getAllByRole('list')[0].className).toMatch(/grid-cols-2/)
    expect(screen.queryByRole('button', { name: /Maurice Mokoena/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('reads "On call Consultant: name"', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    expect(await screen.findByTestId('on-call')).toHaveTextContent('On call Consultant: Kate Meyer')
  })

  it('links View roster to today on the roster holding today, else the Roster page', async () => {
    fetchOnShiftBoard.mockResolvedValueOnce({ ...(await fetchOnShiftBoard()), rosterMonthId: 'rm-nov' })
    const { unmount } = render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    await screen.findAllByTestId('on-shift-group')
    expect(screen.getByRole('link', { name: /View roster/ })).toHaveAttribute('href', '/roster/rm-nov?date=2026-11-24')
    unmount()
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    await screen.findAllByTestId('on-shift-group')
    expect(screen.getByRole('link', { name: /View roster/ })).toHaveAttribute('href', '/roster')
  })

  it('marks a late arrival', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    expect(within(await screen.findByLabelText('Zara Khan · MO · late arrival logged')).getByTestId('on-shift-late')).toBeInTheDocument()
    expect(screen.getAllByTestId('on-shift-late')).toHaveLength(1)
  })

  it('says so when nobody is rostered', async () => {
    fetchOnShiftBoard.mockResolvedValue({ now: [], next: [], consultant: null })
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    expect(await screen.findByText('Nobody on shift on a published roster.')).toBeInTheDocument()
  })
})

describe('OnShiftPanel — desktop', () => {
  beforeEach(() => {
    setViewport(true)
    vi.setSystemTime(new Date(2026, 10, 24, 14, 30))
    fetchOnShiftBoard.mockReset().mockResolvedValue({
      now: [
        group('08:00:00', '18:00:00', [doctor('a', 'Maurice', 'Mokoena'), doctor('b', 'Zara', 'Khan', { late: true })]),
        group('12:00:00', '22:00:00', [{ key: 'd', kind: 'open', initials: '[ ]', name: 'Open locum slot', meta: 'Not covered', label: 'Open locum slot · not covered', late: false }]),
      ],
      next: [group('15:00:00', '01:00:00', [doctor('e', 'Tom', 'Petersen')])],
      consultant: 'Kate Meyer',
    })
  })

  it('shows one row per shift, people side by side with full name and category', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    const groups = await screen.findAllByTestId('on-shift-group')
    expect(groups).toHaveLength(3)
    expect(groups[0].textContent).toMatch(/Now08h00–18h00.*Maurice MokoenaMO.*Zara KhanMO/)
    expect(groups[1].textContent).toMatch(/Now12h00–22h00.*Open locum slotNot covered/)
    expect(groups[2].textContent).toMatch(/Next · in 30 min15h00–01h00.*Tom PetersenMO/)
    expect(groups[2].className).toMatch(/bg-canvas-cool/)
    expect(within(screen.getByLabelText('Zara Khan · MO · late arrival logged')).getByTestId('on-shift-late')).toBeInTheDocument()
    // Names, not badges to tap.
    expect(screen.queryByRole('button', { name: /Maurice Mokoena/ })).not.toBeInTheDocument()
  })

  it('does not repeat the times as "On shift until" or "On at"', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    await screen.findAllByTestId('on-shift-group')
    expect(screen.queryByText(/On shift until/)).not.toBeInTheDocument()
    expect(screen.queryByText(/On at/)).not.toBeInTheDocument()
  })
})
