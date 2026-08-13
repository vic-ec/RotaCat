import { useState } from 'react'
import { ActionSheet, ActionSheetButton } from './ActionSheet'

// Shared, optional "More actions" kebab — renders nothing at all when the
// caller has no items (Annual/Special have no bulk actions today, so they
// simply don't render this rather than getting an empty menu with nowhere
// to click). `items` is a flat list of either action descriptors
// ({ key, icon, label, danger, disabled, onClick }) or the string
// 'divider', which starts a new visually-separated group (e.g. Weekend's
// bulk Copy/Clear actions vs. its single Review log item) — a divider
// entry is a genuine `>` group break, not just another item boundary
// (every item already gets ActionSheet's own between-item line).
// `trigger` is a render-prop (`(onClick, open) => ReactNode`), same
// open-onClick convention as LegendSheet plus the open flag itself so a
// caller can reflect "this menu is currently open" in the trigger's own
// styling (e.g. an icon-only kebab button's selected/active state) —
// trigger content/styling stays fully caller-owned either way.
export default function PageActionsMenu({ title = 'More actions', items, trigger }) {
  const [open, setOpen] = useState(false)
  if (!items || items.length === 0) return null

  const groups = items.reduce((acc, item) => {
    if (item === 'divider') { acc.push([]); return acc }
    acc[acc.length - 1].push(item)
    return acc
  }, [[]])

  return (
    <>
      {trigger(() => setOpen(true), open)}
      {open && (
        <ActionSheet title={title} onClose={() => setOpen(false)}>
          {groups.map((group, i) => (
            <div key={i} className="divide-y divide-slate-line">
              {group.map(item => (
                <ActionSheetButton
                  key={item.key}
                  icon={item.icon}
                  danger={item.danger}
                  disabled={item.disabled}
                  onClick={() => { item.onClick(); setOpen(false) }}
                >
                  {item.label}
                </ActionSheetButton>
              ))}
            </div>
          ))}
        </ActionSheet>
      )}
    </>
  )
}
