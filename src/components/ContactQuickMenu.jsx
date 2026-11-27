import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Mail, MessageSquareText, Phone, Smartphone } from 'lucide-react'
import WhatsAppIcon from './icons/WhatsAppIcon'
import { fetchContactCard } from '../lib/contactCard'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { phoneSmsHref, phoneTelHref, phoneWhatsAppHref } from '../lib/phone'

// The contact menu the Staff list and the Dashboard share: Message and Call
// each open a small flyout below the row tapped, with Mobile and WhatsApp;
// Mail goes straight to the mail client.

// Same horizontal clamping as computeAnchoredPosition. It rolls down from
// the row you tapped, or up when that row sits too near the bottom of the
// screen for it to fit (the Staff list sheet's Message / Call buttons).
const FLYOUT_HEIGHT = 112
function computeFlyoutPosition(anchorRect, width) {
  const vw = window.innerWidth
  const left = Math.min(Math.max(8, anchorRect.right - width), vw - width - 8)
  if (anchorRect.bottom + 6 + FLYOUT_HEIGHT > window.innerHeight - 8) {
    return { left, bottom: window.innerHeight - anchorRect.top + 6 }
  }
  return { left, top: anchorRect.bottom + 6 }
}

// One row of a quick-action menu: a link when `href` is set (opens the
// relevant app directly), otherwise a button (open a flyout, or say the
// detail is missing). `expandable` rows get a chevron (up when closed,
// down when open) and go bold while their flyout is open.
export function QuickActionRow({ icon, label, href, external, muted, expandable, expanded, disabled, title, onClick }) {
  const className = `flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken disabled:cursor-not-allowed disabled:opacity-50 ${
    muted ? 'font-normal text-ink-light' : expanded ? 'font-semibold text-ink' : 'font-medium text-ink'
  }`
  const content = (
    <>
      {icon && <span className="flex flex-shrink-0 items-center text-ink-muted">{icon}</span>}
      <span className="flex-1">{label}</span>
      {expandable && (
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${expanded ? '' : 'rotate-180'}`} aria-hidden="true" />
      )}
    </>
  )
  if (href) {
    return (
      <a href={href} title={title} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={onClick} className={className}>
        {content}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={className}>
      {content}
    </button>
  )
}

// The Message / Call flyout: Mobile (SMS or a phone call) and WhatsApp.
// `onPicked` closes the menus once a link is followed; `onMissing`, when
// given, is called on a tap with no number (the Staff list's toast);
// without it the rows show disabled.
export function ContactFlyout({ section, anchor, phone, menuRef, onPicked, onMissing }) {
  const mobileHref = section === 'message' ? phoneSmsHref(phone) : phoneTelHref(phone)
  const waHref = phoneWhatsAppHref(phone)
  const width = 176
  const row = (href, extra) => (href
    ? { href, onClick: onPicked, ...extra }
    : onMissing ? { onClick: onMissing } : { disabled: true, title: 'No mobile on file' })
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={section === 'message' ? 'Message' : 'Call'}
      style={{ ...computeFlyoutPosition(anchor, width), width }}
      className="fixed z-[55] overflow-hidden rounded-xl border border-edge bg-canvas-raised py-1 shadow-raised"
    >
      <QuickActionRow icon={<Smartphone className="h-[18px] w-[18px]" />} label="Mobile" muted {...row(mobileHref)} />
      <QuickActionRow icon={<WhatsAppIcon className="h-[18px] w-[18px]" />} label="WhatsApp" muted {...row(waHref, { external: true })} />
    </div>
  )
}

// The Dashboard's menu on a name (who is on shift, the consultant on
// call): name and shift at the top, then Message, Call and Mail. Contact
// details load when it opens. `target` = { profileId | contactId, name,
// meta, anchor (DOMRect) }; `triggerRef` is the name tapped, so tapping it
// again closes the menu rather than reopening it.
export default function ContactQuickMenu({ target, onClose, triggerRef }) {
  const [card, setCard] = useState(undefined) // undefined loading, null unavailable
  const [section, setSection] = useState(null) // null | 'message' | 'call'
  const [sectionAnchor, setSectionAnchor] = useState(null)
  const menuRef = useRef(null)
  const flyoutRef = useRef(null)
  useEffect(() => {
    let live = true
    setCard(undefined)
    setSection(null)
    fetchContactCard({ profileId: target.profileId, contactId: target.contactId }).then(c => { if (live) setCard(c) })
    return () => { live = false }
  }, [target.profileId, target.contactId])
  const close = useCallback(() => onClose(), [onClose])
  useDismissablePopover(true, close, menuRef, [flyoutRef, triggerRef].filter(Boolean))

  const phone = card?.phone || null
  const email = card?.email && card.emailVerified ? card.email : null
  const width = 224
  const toggle = (name, el) => {
    if (section === name) { setSection(null); setSectionAnchor(null); return }
    setSection(name)
    setSectionAnchor(el.getBoundingClientRect())
  }
  const loading = card === undefined

  return (
    <>
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Contact ${target.name}`}
        data-testid="contact-menu"
        style={{ ...computeAnchoredPosition(target.anchor, width), width }}
        className="fixed z-50 overflow-hidden rounded-xl border border-edge bg-canvas-raised py-1 shadow-raised"
      >
        <div className="mb-1 border-b border-slate-line px-4 pb-2 pt-1.5">
          <p className="truncate text-sm font-semibold text-ink">{card?.name || target.name}</p>
          {target.meta && <p className="truncate text-xs text-ink-muted">{target.meta}</p>}
        </div>
        {card === null ? (
          <p className="px-4 py-2.5 text-sm text-ink-muted">Contact details aren&rsquo;t available.</p>
        ) : (
          <>
            <QuickActionRow
              icon={<MessageSquareText className="h-5 w-5" />}
              label="Message"
              expandable
              expanded={section === 'message'}
              disabled={loading}
              onClick={e => toggle('message', e.currentTarget)}
            />
            <QuickActionRow
              icon={<Phone className="h-5 w-5" />}
              label="Call"
              expandable
              expanded={section === 'call'}
              disabled={loading}
              onClick={e => toggle('call', e.currentTarget)}
            />
            <QuickActionRow
              icon={<Mail className="h-5 w-5" />}
              label="Mail"
              href={email ? `mailto:${email}` : null}
              disabled={!email}
              title={email ? undefined : loading ? undefined : 'No email on file'}
              onClick={email ? close : undefined}
            />
          </>
        )}
      </div>
      {section && sectionAnchor && (
        <ContactFlyout section={section} anchor={sectionAnchor} phone={phone} menuRef={flyoutRef} onPicked={close} />
      )}
    </>
  )
}
