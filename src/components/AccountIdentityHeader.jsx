import ProfileAvatar from './ProfileAvatar'
import Tag from './Tag'

// Compact identity summary — avatar, full name, and a single supporting
// tag (category/role) — replacing a large card of editable first-name/
// surname fields + a decorative category pill. Deliberately has no
// editable inputs of its own: a pending registrant's name is read-only
// here (see AccountDetailsSection's "Submitted details" for the one place
// it can be corrected), and an established account's name lives in its own
// Personal/Contact details section, not the identity header.
export default function AccountIdentityHeader({ profile, name, tagLabel, size = 44 }) {
  return (
    <div className="flex items-center gap-3">
      <ProfileAvatar profile={profile} size={size} className="flex-shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-ink">{name}</p>
        {tagLabel && <Tag variant="role" className="mt-1">{tagLabel}</Tag>}
      </div>
    </div>
  )
}
