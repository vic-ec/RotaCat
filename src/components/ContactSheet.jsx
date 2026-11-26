import { useEffect, useState } from 'react'
import { Mail, MessageCircle, MessageSquareText, Phone } from 'lucide-react'
import { ActionSheet } from './ActionSheet'
import { fetchContactCard } from '../lib/contactCard'
import { formatPhoneDisplay, phoneSmsHref, phoneTelHref, phoneWhatsAppHref } from '../lib/phone'

// Someone's contact details from a name on the Dashboard (who is on shift,
// the consultant on call): name, mobile and email, and one tap to call,
// text, WhatsApp or email them. The app's sheet (ActionSheet): a bottom
// sheet on a phone, a centred card on a desktop, closed with its ×, a tap
// outside or Esc. The tray is the Staff list's contact sheet's.
// `target` = { profileId | contactId, name, meta }.
export default function ContactSheet({ target, onClose }) {
  const [card, setCard] = useState(undefined) // undefined loading, null unavailable
  useEffect(() => {
    let live = true
    setCard(undefined)
    fetchContactCard({ profileId: target.profileId, contactId: target.contactId }).then(c => { if (live) setCard(c) })
    return () => { live = false }
  }, [target.profileId, target.contactId])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const phone = card?.phone || null
  const email = card?.email && card.emailVerified ? card.email : null
  const actions = [
    { key: 'call', label: 'Call', icon: <Phone className="h-5 w-5" />, href: phoneTelHref(phone) },
    { key: 'sms', label: 'Message', icon: <MessageSquareText className="h-5 w-5" />, href: phoneSmsHref(phone) },
    { key: 'wa', label: 'WhatsApp', icon: <MessageCircle className="h-5 w-5" />, href: phoneWhatsAppHref(phone), external: true },
    { key: 'mail', label: 'Email', icon: <Mail className="h-5 w-5" />, href: email ? `mailto:${email}` : null },
  ]

  return (
    <ActionSheet title="Contact" onClose={onClose}>
      <div className="px-3 pb-2 pt-1" data-testid="contact-sheet">
        <p className="truncate text-base font-semibold text-ink">{card?.name || target.name}</p>
        {target.meta && <p className="truncate text-sm text-ink-muted">{target.meta}</p>}

        <div className="mt-3 space-y-1.5 border-t border-slate-line pt-3 text-sm">
          {card === undefined ? (
            <p className="text-ink-muted">Loading…</p>
          ) : card === null ? (
            <p className="text-ink-muted">Contact details aren&rsquo;t available.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-14 flex-shrink-0 text-ink-muted">Mobile</span>
                <span className="min-w-0 truncate text-ink" data-testid="contact-mobile">{formatPhoneDisplay(phone) || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-14 flex-shrink-0 text-ink-muted">Email</span>
                <span className="min-w-0 truncate text-ink" data-testid="contact-email">{card.email || (card.noAccount ? 'No account yet' : '—')}</span>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {actions.map(a => a.href ? (
            <a
              key={a.key}
              href={a.href}
              title={a.label}
              aria-label={`${a.label} ${card?.name || target.name}`}
              {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={onClose}
              className="flex h-12 flex-1 items-center justify-center rounded-lg border border-slate-line bg-canvas-sunken text-ink-light transition-all hover:border-accent/40 hover:bg-accent-tint hover:text-accent active:scale-95 active:border-accent/40 active:bg-accent-tint active:text-accent"
            >
              {a.icon}
            </a>
          ) : (
            <span
              key={a.key}
              aria-label={`${a.label}: not on record`}
              title={`${a.label}: not on record`}
              className="flex h-12 flex-1 items-center justify-center rounded-lg border border-slate-line bg-canvas-sunken text-ink-muted opacity-40"
            >
              {a.icon}
            </span>
          ))}
        </div>
      </div>
    </ActionSheet>
  )
}
