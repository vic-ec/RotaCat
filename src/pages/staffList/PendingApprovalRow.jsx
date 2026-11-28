import { Check, X, FileUser } from 'lucide-react'
import RequestRow from '../../components/RequestRow'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'

// One row of the Pending-approval list. Selection checkbox feeds the bulk
// action bar above the list; clicking anywhere in the row navigates to the
// dedicated review page rather than expanding an inline panel — editing a
// pending registration's details happens there, including its mobile
// number, which is left out of this collapsed row to keep it scannable.
// Built on the shared ApprovalRow template (same shell Leave Requests
// uses) — the standalone "view" icon this used to also carry was dropped
// since the row click already goes to the exact same place
// (docs/design/layout-spec.md §7/§13).
export default function PendingApprovalRow({ person, approveAccount, rejectAccount, onEdit }) {
  // Doctors show their category (Registrar, MO, …) rather than the "Doctor"
  // role — locum/clerk have no meaningful category, so they show the role.
  const secondaryLabel = person.role === 'doctor'
    ? (person.category ? (CATEGORY_LABELS[person.category] || person.category) : '—')
    : (ROLE_LABELS[person.role] || person.role)
  const registeredDate = person.created_at?.slice(0, 10).split('-').reverse().join('-')
  const registeredTime = person.created_at?.slice(11, 16)
  const fullName = `${person.name ? `${person.name} ` : ''}${person.surname}`
  const registered = `Account registration, submitted ${registeredDate} · ${registeredTime}`

  return (
    <RequestRow
      person={person}
      name={fullName}
      meta={secondaryLabel}
      onClick={() => onEdit(person.id)}
      actions={[
        { icon: <FileUser className="h-4 w-4" />, title: registered, label: `Review ${fullName}'s registration`, onClick: () => onEdit(person.id) },
        { icon: <Check className="h-4 w-4" />, title: 'Approve', label: `Approve ${fullName}`, tone: 'success', onClick: () => approveAccount(person) },
        { icon: <X className="h-4 w-4" />, title: 'Reject', label: `Reject ${fullName}`, tone: 'danger', onClick: () => rejectAccount(person.id) },
      ]}
    />
  )
}
