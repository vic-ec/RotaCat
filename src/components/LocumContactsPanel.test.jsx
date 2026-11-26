import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'

// The panel draws a phone list and a desktop table; jsdom shows both, so
// the tests read the phone list.
const phone = () => within(document.querySelector('[data-testid="locum-contacts-panel"] ul'))
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LocumContactsPanel from './LocumContactsPanel'

const fetchOpenLocumContacts = vi.fn()
const fetchContactShiftCounts = vi.fn()
const fetchLocumProfiles = vi.fn()
const linkLocumContact = vi.fn()
const fetchContactShifts = vi.fn()
const updateLocumContactPhone = vi.fn()
const fetchContactChanges = vi.fn()
vi.mock('../lib/locumCover', async () => {
  const actual = await vi.importActual('../lib/locumCover')
  return {
    ...actual,
    fetchOpenLocumContacts: (...a) => fetchOpenLocumContacts(...a),
    fetchContactShiftCounts: (...a) => fetchContactShiftCounts(...a),
    fetchLocumProfiles: (...a) => fetchLocumProfiles(...a),
    linkLocumContact: (...a) => linkLocumContact(...a),
    fetchContactShifts: (...a) => fetchContactShifts(...a),
    updateLocumContactPhone: (...a) => updateLocumContactPhone(...a),
    fetchContactChanges: (...a) => fetchContactChanges(...a),
  }
})
const fetchLateArrivalsForLocum = vi.fn()
vi.mock('../lib/lateArrivals', async () => {
  const actual = await vi.importActual('../lib/lateArrivals')
  return { ...actual, fetchLateArrivalsForLocum: (...a) => fetchLateArrivalsForLocum(...a) }
})
vi.mock('./AddStaffModal', () => ({ default: ({ initialValues }) => <div>AddStaffStub: {initialValues.name} {initialValues.role}</div> }))

const CONTACT = { id: 'c-1', name: 'Jo', surname: 'Marsh', phone: '0821234567' }

describe('LocumContactsPanel', () => {
  beforeEach(() => {
    fetchOpenLocumContacts.mockReset().mockResolvedValue([CONTACT])
    fetchContactShiftCounts.mockReset().mockResolvedValue(new Map([['c-1', 3]]))
    fetchLocumProfiles.mockReset().mockResolvedValue([])
    linkLocumContact.mockReset().mockResolvedValue(undefined)
    fetchContactShifts.mockReset().mockResolvedValue([])
    fetchLateArrivalsForLocum.mockReset().mockResolvedValue([])
    updateLocumContactPhone.mockReset().mockImplementation(async (id, digits) => digits)
    fetchContactChanges.mockReset().mockResolvedValue([])
  })

  it('renders nothing when every locum on the roster has an account', async () => {
    fetchOpenLocumContacts.mockResolvedValue([])
    const { container } = render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await waitFor(() => expect(fetchOpenLocumContacts).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lists a contact with their shifts and a WhatsApp invite that carries the sign-up link', async () => {
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    expect((await screen.findAllByText('Jo Marsh')).length).toBeGreaterThan(0)
    expect(phone().getByText(/3 shifts/)).toBeInTheDocument()
    const invite = phone().getByRole('link', { name: 'WhatsApp Jo' })
    expect(invite.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/27821234567\?text=/)
    const text = decodeURIComponent(invite.getAttribute('href').split('?text=')[1])
    expect(text).toContain('Hi Jo.')
    // Three shifts under this contact, so the message says so.
    expect(text).toContain("You've been rostered for shifts at Victoria Hospital Emergency Centre.")
    expect(text.endsWith('/signup')).toBe(true)
  })

  it('the pencil opens the mobile under the row; Update saves a full new number and the row shows it', async () => {
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    expect(phone().getByText(/\(082\) 123-4567/)).toBeInTheDocument()
    await userEvent.click(phone().getByRole('button', { name: "Edit Jo's mobile number" }))
    const editor = phone().getByTestId('contact-phone-editor')
    const field = within(editor).getByRole('textbox', { name: "Jo's mobile number" })
    const update = within(editor).getByRole('button', { name: 'Update' })
    expect(update).toBeDisabled() // unchanged
    await userEvent.clear(field)
    await userEvent.type(field, '083555')
    expect(within(editor).getByText('Enter all 10 digits.')).toBeInTheDocument()
    expect(update).toBeDisabled()
    await userEvent.type(field, '0142')
    await userEvent.click(update)
    expect(updateLocumContactPhone).toHaveBeenCalledWith('c-1', '0835550142')
    await waitFor(() => expect(screen.queryAllByTestId('contact-phone-editor')).toHaveLength(0))
    expect(phone().getByText(/\(083\) 555-0142/)).toBeInTheDocument()
    expect(fetchContactShifts).not.toHaveBeenCalled() // the pencil doesn't open the shifts too
  })

  it('notes a number another locum on the list already has, and Cancel puts the old one back', async () => {
    fetchOpenLocumContacts.mockResolvedValue([CONTACT, { id: 'c-2', name: 'Ann', surname: 'Walker', phone: '0835550142' }])
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    await userEvent.click(phone().getByRole('button', { name: "Edit Jo's mobile number" }))
    const field = phone().getByRole('textbox', { name: "Jo's mobile number" })
    await userEvent.clear(field)
    await userEvent.type(field, '0835550142')
    expect(phone().getByTestId('contact-phone-shared')).toHaveTextContent('Also Ann Walker\'s number.')
    await userEvent.click(phone().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryAllByTestId('contact-phone-editor')).toHaveLength(0)
    expect(updateLocumContactPhone).not.toHaveBeenCalled()
    expect(phone().getAllByText(/\(082\) 123-4567/).length).toBe(1)
  })

  it('the locum\'s window lists mobile number changes: old → new, by whom and when', async () => {
    fetchContactChanges.mockResolvedValue([{ id: 'ch1', oldValue: '0821234567', newValue: '0835550142', at: '2026-11-26T12:32:00Z', byName: 'Pat Admin' }])
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    await userEvent.click(phone().getByTestId('locum-contact-row'))
    const changes = await screen.findByTestId('contact-phone-changes')
    expect(changes).toHaveTextContent('(082) 123-4567 → (083) 555-0142')
    expect(changes).toHaveTextContent(/By Pat Admin · 26 Nov 2026/)
    expect(fetchContactChanges).toHaveBeenCalledWith('c-1')
  })

  it('"Create account" opens Add staff prefilled as a locum', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    await user.click(phone().getByRole('button', { name: "Create Jo's account" }))
    expect(screen.getByText('AddStaffStub: Jo locum')).toBeInTheDocument()
  })

  it('an account with the same mobile is suggested, and one click moves the shifts onto it', async () => {
    fetchLocumProfiles.mockResolvedValue([{ id: 'loc-9', name: 'Jo', surname: 'Marsh', phone: '+27 82 123 4567' }])
    const onLinked = vi.fn()
    const user = userEvent.setup()
    render(<MemoryRouter><LocumContactsPanel onLinked={onLinked} /></MemoryRouter>)
    expect((await screen.findAllByTestId('contact-match'))[0]).toHaveTextContent('Same mobile as Jo Marsh’s account.')
    await user.click(phone().getByRole('button', { name: 'Move the shifts onto it' }))
    await waitFor(() => expect(linkLocumContact).toHaveBeenCalledWith({ contactId: 'c-1', profileId: 'loc-9' }))
    await waitFor(() => expect(onLinked).toHaveBeenCalled())
  })

  it('with no matching mobile, an account can still be picked by hand', async () => {
    fetchLocumProfiles.mockResolvedValue([{ id: 'loc-5', name: 'Jo', surname: 'Marsh-Lee', phone: '0830000000' }])
    const user = userEvent.setup()
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    expect(screen.queryByTestId('contact-match')).not.toBeInTheDocument()
    await user.click(phone().getByRole('button', { name: 'Link Jo to an existing account' }))
    expect(phone().getByRole('button', { name: 'Move 3 shifts' })).toBeDisabled()
    await user.click(phone().getByText('Choose their locum account…'))
    await user.click(await screen.findByText('Marsh-Lee, Jo'))
    await user.click(phone().getByRole('button', { name: 'Move 3 shifts' }))
    await waitFor(() => expect(linkLocumContact).toHaveBeenCalledWith({ contactId: 'c-1', profileId: 'loc-5' }))
  })

  it('reports its count to the page, for the tab badge and the notice', async () => {
    const onCount = vi.fn()
    render(<MemoryRouter><LocumContactsPanel onCount={onCount} /></MemoryRouter>)
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1))
  })

  it('tapping a row lists their rostered shifts, newest first, each linking to its cell on the roster', async () => {
    fetchContactShifts.mockResolvedValue([
      { id: 'e2', date: '2026-11-20', rosterMonthId: 'rm1', code: 'WD_12' },
      { id: 'e1', date: '2026-11-03', rosterMonthId: 'rm1', code: 'WD_08' },
    ])
    const user = userEvent.setup()
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    await user.click(phone().getByTestId('locum-contact-row'))
    const list = within(await screen.findByTestId('contact-shifts'))
    const rows = list.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('20 Nov 2026 · 12h-22h')
    expect(rows[1]).toHaveTextContent('3 Nov 2026 · 08h-18h')
    expect(within(rows[0]).getByRole('link', { name: /View on roster/ })).toHaveAttribute('href', '/roster/rm1?date=2026-11-20&entry=e2')
  })

  it('lists the locum\'s late arrivals on their entry, matched on the contact and the roster name', async () => {
    fetchLateArrivalsForLocum.mockResolvedValue([
      { id: 'l1', entry_date: '2026-11-20', shift_code: 'WD_12', shift_start: '12:00:00', arrived_at: '12:40:00', minutes_late: 40, reason_given: 'Traffic on the N2' },
    ])
    const user = userEvent.setup()
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    await user.click(phone().getByTestId('locum-contact-row'))
    const section = await screen.findByTestId('contact-late-arrivals')
    expect(await within(section).findByText(/40 min late/)).toBeInTheDocument()
    expect(section.textContent).toMatch(/20 Nov 2026/)
    expect(section.textContent).toMatch(/Shift start 12h00 · arrived 12h40 · reason given: Traffic on the N2/)
    expect(section.textContent).not.toMatch(/Logged by/)
    expect(fetchLateArrivalsForLocum).toHaveBeenCalledWith({ contactId: 'c-1', name: 'Jo Marsh' })
  })

  it('says so when a locum has no late arrivals', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><LocumContactsPanel /></MemoryRouter>)
    await screen.findAllByText('Jo Marsh')
    await user.click(phone().getByTestId('locum-contact-row'))
    expect(await within(await screen.findByTestId('contact-late-arrivals')).findByText('No late arrivals recorded.')).toBeInTheDocument()
  })
})
