import { useState } from 'react'
import Modal from './Modal'
import GeneratedPasswordNotice from './GeneratedPasswordNotice'
import { formatPhoneProgressive } from '../lib/phone'
import { isValidEmail } from '../lib/validateEmail'
import { createStaffAccount } from '../lib/staffCredentials'
import { createLocumContact } from '../lib/locumCover'

// A locum the roster doesn't know yet, added from the roster itself.
//
// Name and mobile are all it needs: a locum confirmed over the phone has to
// go on the roster at once, and waiting on an email address would hold the
// roster up. Without an email the locum is saved as a contact (admin-
// only) and the account is made later from the Staff page. With one, the
// account is created here and now, exactly as "Add staff" creates it —
// already approved, with a temporary password emailed to them.
//
// onDone(cover) hands back the cover to assign (see lib/locumCover.js).
export default function NewLocumModal({ adminId, onDone, onClose }) {
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Set once an account is created: the outcome must be read before the
  // dialog closes, since an undelivered password is shown only here.
  const [created, setCreated] = useState(null)

  const fullName = `${name.trim()} ${surname.trim()}`.trim()
  const wantsAccount = Boolean(email.trim())

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('First name is required.'); return }
    if (!surname.trim()) { setError('Surname is required.'); return }
    if (phone.length !== 10) { setError('Enter a 10-digit mobile number.'); return }
    if (wantsAccount && !isValidEmail(email.trim())) { setError('Enter a valid email address, or leave it empty.'); return }

    setError('')
    setSubmitting(true)
    try {
      if (wantsAccount) {
        const response = await createStaffAccount({
          name: name.trim(), surname: surname.trim(), phone, email: email.trim(),
          role: 'locum', category: null, contractType: 'full', subtype: null,
          activeFrom: null, activeUntil: null, rotations: [],
        })
        if (!response.ok) { setError(response.error); setSubmitting(false); return }
        setCreated({ response, cover: { kind: 'locum', id: response.profileId, name: fullName, surname: surname.trim() } })
      } else {
        const row = await createLocumContact({ name, surname, phone, createdBy: adminId })
        onDone({ kind: 'contact', id: row.id, name: fullName, surname: surname.trim() })
        return
      }
    } catch (err) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  if (created) {
    const { response, cover } = created
    return (
      <Modal
        title={response.emailSent ? 'Locum account created' : 'Locum account created — email not sent'}
        onClose={() => onDone(cover)}
        centered
        footer={<button type="button" className="btn-primary flex-1" onClick={() => onDone(cover)}>Add to the shift</button>}
      >
        {response.emailSent ? (
          <p className="text-sm text-ink">
            {fullName}&apos;s account is ready and their login details have been emailed to{' '}
            <span className="font-medium">{email.trim()}</span>.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">
              {fullName}&apos;s account was created, but the welcome email to{' '}
              <span className="font-medium">{email.trim()}</span> could not be sent
              {response.emailError ? ` (${response.emailError})` : ''}.
            </p>
            {response.password && <GeneratedPasswordNotice password={response.password} />}
          </>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title="New locum"
      onClose={onClose}
      centered
      footer={
        <>
          <button type="button" className="btn-secondary px-3" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" form="new-locum-form" className="btn-primary flex-1" disabled={submitting}>
            {submitting ? 'Saving…' : wantsAccount ? 'Create account & add' : 'Add to the shift'}
          </button>
        </>
      }
    >
      <form id="new-locum-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="locum-name" className="label-text">First name</label>
            <input id="locum-name" required autoComplete="off" className="input-field" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="locum-surname" className="label-text">Surname</label>
            <input id="locum-surname" required autoComplete="off" className="input-field" value={surname} onChange={e => setSurname(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="locum-phone" className="label-text">Mobile number</label>
          <input
            id="locum-phone"
            type="tel"
            inputMode="numeric"
            required
            autoComplete="off"
            className="input-field"
            placeholder="(082) 123-4567"
            value={formatPhoneProgressive(phone)}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
        </div>
        <div>
          <label htmlFor="locum-email" className="label-text">Email (optional)</label>
          <input
            id="locum-email"
            type="email"
            autoComplete="off"
            className="input-field"
            placeholder="name@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-muted">
            {wantsAccount
              ? 'An account is created now and their login details are emailed to this address.'
              : 'Leave empty to put them on the roster now. They are listed under Staff → Requests → New Users until they have an account; their shifts move onto it.'}
          </p>
        </div>
        {error && <p className="text-xs text-flagRed" role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
