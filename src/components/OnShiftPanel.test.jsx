import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OnShiftPanel from './OnShiftPanel'

const fetchOnShiftBoard = vi.hoisted(() => vi.fn())
vi.mock('../lib/onShiftBoard', async () => ({ ...(await vi.importActual('../lib/onShiftBoard')), fetchOnShiftBoard }))

const doctor = (key, name, surname, extra = {}) => ({ key, kind: 'doctor', profile: { name, surname, color_code: '#0F766E' }, initials: `${name[0]}${surname[0]}`, label: `${name} ${surname} · MO`, late: false, ...extra })
const group = (startTime, endTime, people, extra = {}) => ({
  key: startTime, startTime, endTime, night: false, people,
  start: new Date(`2026-11-24T${startTime}`), end: new Date(`2026-11-24T${endTime}`), ...extra,
})

describe('OnShiftPanel', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 24, 14, 30))
    fetchOnShiftBoard.mockReset().mockResolvedValue({
      now: [
        group('08:00:00', '18:00:00', [
          doctor('a', 'Maurice', 'Mokoena'),
          doctor('b', 'Zara', 'Khan', { late: true }),
          { key: 'c', kind: 'locum', initials: 'DS', label: 'Dr Smith · Locum · covering Naledi Dlamini', late: false },
        ]),
        group('12:00:00', '22:00:00', [{ key: 'd', kind: 'open', initials: '[ ]', label: 'Open locum slot · not covered', late: false }]),
      ],
      next: [group('15:00:00', '01:00:00', [doctor('e', 'Tom', 'Petersen')])],
      consultant: 'Kate Meyer',
    })
  })

  it('shows one row per shift: now with its end, next with its start', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    const rows = within(await screen.findByTestId('on-shift-panel')).getAllByRole('listitem').filter(li => li.querySelector('ul'))
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toMatch(/Now.*08h00–18h00.*On shift until 18h00/)
    expect(rows[1].textContent).toMatch(/Now.*12h00–22h00.*On shift until 22h00/)
    expect(rows[2].textContent).toMatch(/Next · in 30 min.*15h00–01h00.*On at 15h00/)
    expect(screen.getByText(/Consultant: Kate Meyer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View roster/ })).toHaveAttribute('href', '/roster')
  })

  it('shows initials only, with the full name on hover and on tap', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    const badge = await screen.findByRole('button', { name: 'Maurice Mokoena · MO' })
    expect(badge.textContent).toMatch(/^MM/)
    const tip = within(badge).getByRole('tooltip', { hidden: true })
    expect(tip).toHaveTextContent('Maurice Mokoena · MO')
    expect(tip.className).toMatch(/hidden group-hover:block/)
    await userEvent.click(badge)
    expect(badge).toHaveAttribute('aria-expanded', 'true')
    expect(tip.className).not.toMatch(/hidden/)
  })

  it('marks a late arrival, a locum covering someone and an open slot', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    const khan = await screen.findByRole('button', { name: 'Zara Khan · MO · late arrival logged' })
    expect(within(khan).getByTestId('on-shift-late')).toBeInTheDocument()
    expect(screen.getAllByTestId('on-shift-late')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Dr Smith · Locum · covering Naledi Dlamini' })).toHaveTextContent(/^DS/)
    expect(screen.getByRole('button', { name: 'Open locum slot · not covered' })).toHaveTextContent(/^\[ \]/)
  })

  it('says so when nobody is rostered', async () => {
    fetchOnShiftBoard.mockResolvedValue({ now: [], next: [], consultant: null })
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    expect(await screen.findByText('Nobody on shift on a published roster.')).toBeInTheDocument()
  })
})
