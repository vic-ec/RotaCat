import { useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { ActionSheet, ActionSheetButton } from './ActionSheet'

// Shared, optional "More actions" kebab — renders nothing at all when the
// caller has no items (Annual/Special have no bulk actions today, so they
// simply don't render this rather than getting an empty menu with nowhere
// to click). `items` is a flat list of either action descriptors
// ({ key, icon, label, danger, disabled, onClick }), a submenu descriptor
// ({ key, icon, label, value, options: [{ key, label }], onSelect }), or the
// string 'divider', which starts a new visually-separated group (e.g. Weekend's
// bulk Copy/Clear actions vs. its single Review log item) — a divider
// entry is a genuine `>` group break, not just another item boundary
// (every item already gets ActionSheet's own between-item line).
// `trigger` is a render-prop (`(onClick, open) => ReactNode`), same
// open-onClick convention as LegendSheet plus the open flag itself so a
// caller can reflect "this menu is currently open" in the trigger's own
// styling (e.g. an icon-only kebab button's selected/active state) —
// trigger content/styling stays fully caller-owned either way.
//
// A submenu item is one row showing its current value, which swaps the
// sheet's body for that item's options rather than opening a second sheet
// over the first — same move DateStepper's jump sheet makes when it swaps
// months for years, and on a phone a stacked sheet just buries the one
// underneath. Use it for a setting with three or four values (roster text
// size) instead of spending a row of the parent list on each: those rows
// read as actions, and a list of them says nothing about what they have in
// common. Picking a value closes the sheet, like every other row here.
export default function PageActionsMenu({ title = 'More actions', items, trigger }) {
  const [open, setOpen] = useState(false)
  // The submenu item whose options are showing, if any. Cleared on close so
  // reopening the kebab always lands on the parent list.
  const [submenu, setSubmenu] = useState(null)
  if (!items || items.length === 0) return null

  function close() {
    setOpen(false)
    setSubmenu(null)
  }

  const groups = items.reduce((acc, item) => {
    if (item === 'divider') { acc.push([]); return acc }
    acc[acc.length - 1].push(item)
    return acc
  }, [[]])

  return (
    <>
      {trigger(() => setOpen(true), open)}
      {open && submenu && (
        <ActionSheet title={submenu.label} onBack={() => setSubmenu(null)} onClose={close}>
          <div className="divide-y divide-slate-line">
            {submenu.options.map(option => (
              <ActionSheetButton
                key={option.key}
                icon={<Check className={`h-4 w-4 ${option.key === submenu.value ? 'text-accent' : 'invisible'}`} />}
                onClick={() => { submenu.onSelect(option.key); close() }}
              >
                {option.label}
              </ActionSheetButton>
            ))}
          </div>
        </ActionSheet>
      )}
      {open && !submenu && (
        <ActionSheet title={title} onClose={close}>
          {groups.map((group, i) => (
            <div key={i} className="divide-y divide-slate-line">
              {group.map(item => item.options ? (
                <ActionSheetButton
                  key={item.key}
                  icon={item.icon}
                  onClick={() => setSubmenu(item)}
                  trailing={
                    <span className="flex flex-shrink-0 items-center gap-1 text-ink-muted">
                      <span className="text-sm font-normal">{item.options.find(o => o.key === item.value)?.label}</span>
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  }
                >
                  {item.label}
                </ActionSheetButton>
              ) : (
                <ActionSheetButton
                  key={item.key}
                  icon={item.icon}
                  danger={item.danger}
                  disabled={item.disabled}
                  onClick={() => { item.onClick(); close() }}
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
