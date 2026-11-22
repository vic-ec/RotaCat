import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'

// The panel draws a phone list and a desktop table; jsdom shows both, so
// the tests read the phone list.
const phone = () => within(document.querySelector('[data-testid="locum-contacts-panel"] ul'))
import userEvent from '@testing-library/user-event'
import LocumContactsPanel from './LocumContactsPanel'

const fetchOpenLocumContacts = vi.fn()
const fetchContactShiftCounts = vi.fn()
const fetchLocumProfiles = vi.fn()
const linkLocumContact = vi.fn()
vi.mock('../lib/locumCover', async () => {
  const actual = await vi.importActual('../lib/locumCover')
  return {
    ...actual,
    fetchOpenLocumContacts: (...a) => fetchOpenLocumContacts(...a),
    fetchContactShiftCounts: (...a) => fetchContactShiftCounts(...a),
    fetchLocumProfiles: (...a) => fetchLocumProfiles(...a),
    linkLocumContact: (...a) => linkLocumContact(...a),
  }
})
vi.mock('./AddStaffModal', () => ({ default: ({ initialValues }) => <div>AddStaffStub: {initialValues.name} {initialValues.role}</div> }))

const CONTACT = { id: 'c-1', name: 'Jo', surname: 'Marsh', phone: '0821234567' }

describe('LocumContactsPanel', () => {
  beforeEach(() => {
    fetchOpenLocumContacts.mockReset().mockResolvedValue([CONTACT])
    fetchContactShiftCounts.mockReset().mockResolvedValue(new Map([['c-1', 3]]))
    fetchLocumProfiles.mockReset().mockResolvedValue([])
    linkLocumContact.mockReset().mockResolvedValue(undefined)
  })

  it('renders nothing when every locum on the roster has an account', async () => {
    fetchOpenLocumContacts.mockResolvedValue([])
    const { container } = render(<LocumContactsPanel />)
    await waitFor(() => expect(fetchOpenLocumContacts).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lists a contact with their shifts and a WhatsApp invite that carries the sign-up link', async () => {
    render(<LocumContactsPanel />)
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

  it('"Create account" opens Add staff prefilled as a locum', async () => {
    const user = userEvent.setup()
    render(<LocumContactsPanel />)
    await screen.findAllByText('Jo Marsh')
    await user.click(phone().getByRole('button', { name: "Create Jo's account" }))
    expect(screen.getByText('AddStaffStub: Jo locum')).toBeInTheDocument()
  })

  it('an account with the same mobile is suggested, and one click moves the shifts onto it', async () => {
    fetchLocumProfiles.mockResolvedValue([{ id: 'loc-9', name: 'Jo', surname: 'Marsh', phone: '+27 82 123 4567' }])
    const onLinked = vi.fn()
    const user = userEvent.setup()
    render(<LocumContactsPanel onLinked={onLinked} />)
    expect((await screen.findAllByTestId('contact-match'))[0]).toHaveTextContent('Same mobile as Jo Marsh’s account.')
    await user.click(phone().getByRole('button', { name: 'Move the shifts onto it' }))
    await waitFor(() => expect(linkLocumContact).toHaveBeenCalledWith({ contactId: 'c-1', profileId: 'loc-9' }))
    await waitFor(() => expect(onLinked).toHaveBeenCalled())
  })

  it('with no matching mobile, an account can still be picked by hand', async () => {
    fetchLocumProfiles.mockResolvedValue([{ id: 'loc-5', name: 'Jo', surname: 'Marsh-Lee', phone: '0830000000' }])
    const user = userEvent.setup()
    render(<LocumContactsPanel />)
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
    render(<LocumContactsPanel onCount={onCount} />)
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1))
  })
})
