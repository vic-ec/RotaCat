import { NOTIFICATION_GROUPS, NOTIFICATION_ORDER, NOTIFICATION_LABELS } from './accountSettingsHelpers'
import SectionRow from './SectionRow'
import Toggle from './Toggle'
import { BellIcon } from './icons'

// Notifications (your own account). Moved out of AccountSettingsPage as it was.
export default function NotificationsSection({ allNotificationsOn, togglePrefs, visibleNotificationKeys, prefs, showAdvancedNotifications, setShowAdvancedNotifications }) {
  return (
    <SectionRow icon={<BellIcon className="h-5 w-5" />} title="Notifications">
  <div className="flex items-center justify-between border-b border-slate-line pb-3">
    <p className="text-sm font-medium text-ink">All notifications</p>
    <Toggle checked={allNotificationsOn} onChange={v => togglePrefs(visibleNotificationKeys, v)} />
  </div>

  <div className="divide-y divide-slate-line">
    {NOTIFICATION_GROUPS.map(group => {
      const visibleKeys = group.keys.filter(key => key in prefs)
      if (visibleKeys.length === 0) return null
      const groupOn = visibleKeys.every(key => prefs[key] !== false)
      return (
        <div key={group.key} className="flex items-center justify-between py-3">
          <span className="text-sm text-ink">{group.label}</span>
          <Toggle checked={groupOn} onChange={v => togglePrefs(visibleKeys, v)} />
        </div>
      )
    })}
  </div>

  <button
    type="button"
    onClick={() => setShowAdvancedNotifications(s => !s)}
    className="mt-3 text-xs font-medium text-accent hover:text-accent-dark"
  >
    {showAdvancedNotifications ? 'Hide advanced settings' : 'Show advanced settings'}
  </button>

  {showAdvancedNotifications && (
    <div className="mt-2 divide-y divide-slate-line border-t border-slate-line">
      {NOTIFICATION_ORDER.filter(key => key in prefs).map(key => (
        <div key={key} className="flex items-center justify-between py-2.5">
          <span className="text-sm text-ink">{NOTIFICATION_LABELS[key] || key}</span>
          <Toggle checked={prefs[key] !== false} onChange={v => togglePrefs([key], v)} />
        </div>
      ))}
    </div>
  )}
    </SectionRow>
  )
}
