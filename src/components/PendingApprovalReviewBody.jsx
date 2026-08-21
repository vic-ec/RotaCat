import AccountIdentityHeader from './AccountIdentityHeader'
import AccountDetailsSection from './AccountDetailsSection'
import RoleAndAccessSection from './RoleAndAccessSection'
import AccountChecks from './AccountChecks'
import { ROLE_OPTIONS, CATEGORY_OPTIONS } from '../lib/usePendingApprovalReview'

// The scrollable body content of a pending-registration review — identity,
// submitted details, role/access assignment, account checks. Shared by
// both presentations (the standalone /staff/pending/:id page and the
// Staff list's embedded review drawer) so they can never show different
// fields or drift apart; only the surrounding chrome (full page vs.
// drawer) differs between them. `review` is a 'ready'-status result from
// usePendingApprovalReview.
export default function PendingApprovalReviewBody({ review }) {
  return (
    <div className="space-y-6">
      <AccountIdentityHeader profile={review.profile} name={review.fullName} tagLabel={review.assignedLabel} />

      <AccountDetailsSection
        heading="Submitted details"
        editing={review.editingDetails}
        fields={review.detailsFields}
        action={
          <button
            type="button"
            onClick={() => review.setEditingDetails(o => !o)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {review.editingDetails ? 'Done editing' : 'Edit submitted details'}
          </button>
        }
      />

      <RoleAndAccessSection
        heading="Access to assign"
        role={review.role} onRoleChange={review.onRoleChange} roleOptions={ROLE_OPTIONS}
        showCategory={review.showCategory} category={review.category} onCategoryChange={review.onCategoryChange} categoryOptions={CATEGORY_OPTIONS}
        showContractType={review.showContractType} contractType={review.contractType} onContractTypeChange={review.onContractTypeChange}
        showSubtype={review.showSubtype} subtype={review.subtype} onSubtypeChange={review.onSubtypeChange}
        adminEnabled={review.hasAdmin} onAdminChange={review.onAdminChange}
        adminAvailable={review.adminAvailable}
        adminUnavailableReason="Only doctor accounts can be granted admin access."
        showScheduling={review.showScheduling}
        activeFrom={review.activeFrom} onActiveFromChange={review.onActiveFromChange}
        activeUntil={review.activeUntil} onActiveUntilChange={review.onActiveUntilChange}
      />

      <AccountChecks checks={review.accountChecks} />
    </div>
  )
}
