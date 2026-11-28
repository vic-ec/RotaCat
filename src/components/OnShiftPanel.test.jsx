import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OnShiftPanel from './OnShiftPanel'

function setViewport(desktop) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })
}

const fetchOnShiftBoard = vi.hoisted(() => vi.fn())
vi.mock('../lib/onShiftBoard', async () => ({ ...(await vi.importActual('../lib/onShiftBoard')), fetchOnShiftBoard }))
const { fetchContactCard, getCachedContactCard, prefetchContactCards } = vi.hoisted(() => ({
  fetchContactCard: vi.fn(), getCachedContactCard: vi.fn(), prefetchContactCards: vi.fn(),
}))
vi.mock('../lib/contactCard', () => ({ fetchContactCard, getCachedContactCard, prefetchContactCards }))

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

describe('OnShiftPanel — contact details', () => {
  beforeEach(() => {
    setViewport(false)
    vi.setSystemTime(new Date(2026, 10, 24, 14, 30))
    fetchContactCard.mockReset().mockResolvedValue({ name: 'Maurice Mokoena', phone: '0821234567', email: 'm@example.test', emailVerified: true })
    getCachedContactCard.mockReset().mockReturnValue(undefined)
    prefetchContactCards.mockReset().mockResolvedValue()
    fetchOnShiftBoard.mockReset().mockResolvedValue({
      now: [group('08:00:00', '18:00:00', [
        doctor('a', 'Maurice', 'Mokoena', { profileId: 'p-1' }),
        { key: 'd', kind: 'open', initials: '[ ]', name: 'Open locum slot', meta: 'Not covered', label: 'Open locum slot · not covered', late: false },
      ])],
      next: [],
      consultant: 'Kate Meyer',
      consultantId: 'c-1',
      contactProfiles: [{ id: 'p-1', name: 'Maurice', surname: 'Mokoena', phone: '0821234567', email_verified: true }],
    })
  })

  it('prefetches contact details for the people on the board as it loads', async () => {
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    await screen.findAllByTestId('on-shift-group')
    expect(prefetchContactCards).toHaveBeenCalledWith([{ id: 'p-1', name: 'Maurice', surname: 'Mokoena', phone: '0821234567', email_verified: true }])
  })

  it('details already in memory show at once, with no loading and no fetch', async () => {
    vi.useRealTimers()
    getCachedContactCard.mockImplementation(({ profileId }) => (profileId === 'p-1'
      ? { name: 'Maurice Mokoena', phone: '0821234567', email: 'm@example.test', emailVerified: true }
      : undefined))
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /Maurice Mokoena · MO\. Contact/ }))
    const menu = screen.getByTestId('contact-menu')
    // On the first render: enabled rows and the Mail link, nothing to wait for.
    expect(within(menu).getByRole('button', { name: 'Message' })).toBeEnabled()
    expect(within(menu).getByRole('button', { name: 'Call' })).toBeEnabled()
    expect(within(menu).getByRole('link', { name: 'Mail' })).toHaveAttribute('href', 'mailto:m@example.test')
    expect(fetchContactCard).not.toHaveBeenCalled()
  })

  it('a tap on a doctor opens the contact menu: Message and Call (Mobile, WhatsApp) and Mail', async () => {
    vi.useRealTimers()
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    const name = await screen.findByRole('button', { name: /Maurice Mokoena · MO\. Contact/ })
    await userEvent.click(name)
    const menu = await screen.findByTestId('contact-menu')
    expect(fetchContactCard).toHaveBeenCalledWith({ profileId: 'p-1', contactId: undefined })
    expect(menu).toHaveTextContent('Maurice Mokoena')
    expect(await within(menu).findByRole('link', { name: 'Mail' })).toHaveAttribute('href', 'mailto:m@example.test')
    await userEvent.click(within(menu).getByRole('button', { name: 'Message' }))
    let flyout = screen.getByRole('menu', { name: 'Message' })
    expect(within(flyout).getByRole('link', { name: 'Mobile' })).toHaveAttribute('href', expect.stringMatching(/^sms:/))
    expect(within(flyout).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/27821234567')
    await userEvent.click(within(menu).getByRole('button', { name: 'Call' }))
    flyout = screen.getByRole('menu', { name: 'Call' })
    expect(within(flyout).getByRole('link', { name: 'Mobile' })).toHaveAttribute('href', 'tel:0821234567')
    expect(within(flyout).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/27821234567')
    // Tapping the name again closes it.
    await userEvent.click(name)
    expect(screen.queryByTestId('contact-menu')).not.toBeInTheDocument()
    // An open slot has nobody to contact.
    expect(screen.queryByRole('button', { name: /Open locum slot/ })).not.toBeInTheDocument()
  })

  it('no mobile on file: Mobile and WhatsApp show disabled', async () => {
    vi.useRealTimers()
    fetchContactCard.mockResolvedValue({ name: 'Maurice Mokoena', phone: null, email: null, emailVerified: false })
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /Maurice Mokoena · MO\. Contact/ }))
    const menu = await screen.findByTestId('contact-menu')
    await waitFor(() => expect(within(menu).getByRole('button', { name: 'Message' })).toBeEnabled())
    expect(within(menu).getByRole('button', { name: 'Mail' })).toBeDisabled()
    await userEvent.click(within(menu).getByRole('button', { name: 'Message' }))
    const flyout = screen.getByRole('menu', { name: 'Message' })
    expect(within(flyout).getByRole('button', { name: 'Mobile' })).toBeDisabled()
    expect(within(flyout).getByRole('button', { name: 'WhatsApp' })).toBeDisabled()
  })

  it('the consultant on call opens theirs too', async () => {
    vi.useRealTimers()
    render(<MemoryRouter><OnShiftPanel /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /Kate Meyer, consultant on call/ }))
    expect(await screen.findByTestId('contact-menu')).toHaveTextContent('Consultant on call')
    expect(fetchContactCard).toHaveBeenCalledWith({ profileId: 'c-1', contactId: undefined })
  })
})
