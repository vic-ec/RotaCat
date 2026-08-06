import AccountSettingsPage from '../pages/AccountSettingsPage'
import SlideOverPanel from './SlideOverPanel'

// Renders /account/:id as a slide-over panel hugging the right edge of the
// viewport instead of a full-page navigation — triggered by the Staff
// list's desktop row click (see App.jsx's background-location routing).
// No dimmed backdrop: matches every other popover/panel in the app (see
// useDismissablePopover) — the first outside click just closes this panel
// rather than also acting on whatever's underneath it, so the Staff list
// stays fully visible and doesn't need a visual overlay to feel "muted".
export default function AccountSlideOverPanel() {
  return (
    <SlideOverPanel fallbackPath="/staff">
      <AccountSettingsPage />
    </SlideOverPanel>
  )
}
