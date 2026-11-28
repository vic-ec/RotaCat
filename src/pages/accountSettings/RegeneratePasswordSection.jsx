import { KeyRound } from 'lucide-react'
import RegeneratePasswordPanel from '../../components/RegeneratePasswordPanel'
import SectionRow from './SectionRow'

// Regenerate password (an admin on someone else's account). Moved out of AccountSettingsPage as it was.
export default function RegeneratePasswordSection({ profile, targetEmail, reloadTarget }) {
  return (
    <SectionRow
      icon={<KeyRound className="h-5 w-5" />}
      title="Regenerate password"
      // must_change_password / temp_password_issued_at may have
      // moved by the time this closes.
      onClose={reloadTarget}
    >
      <RegeneratePasswordPanel
        person={profile}
        email={targetEmail || undefined}
        onDone={reloadTarget}
      />
    </SectionRow>
  )
}
