import CheckIcon from './icons/CheckIcon'

// The checkbox rows of a multi-select filter group — shared by FilterPanel
// (desktop popover) and Toolbar's ToolbarGroupInline (mobile sheet) so the
// two lists can't drift. `selected` is a Set of option values.
//
// An option may carry `children` ([{ value, label }]): it renders as a
// parent row whose box is ticked when every child is selected (a dash when
// only some are), and toggles all its children at once; the children sit
// indented under it. Only leaf values ever go into `selected` — a parent
// has no value of its own.
export default function FilterOptionRows({ options, selected, onChange, rowPadding = 'py-1.5' }) {
  function setValues(values, on) {
    const next = new Set(selected)
    for (const v of values) {
      if (on) next.add(v)
      else next.delete(v)
    }
    onChange(next)
  }

  function row({ key, checked, mixed = false, label, onToggle, indent = false }) {
    return (
      <label
        key={key}
        className={`flex w-full cursor-pointer items-center gap-2.5 ${indent ? 'pl-10 pr-4' : 'px-4'} ${rowPadding} text-sm text-ink-light transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken`}
      >
        <input type="checkbox" checked={checked} onChange={onToggle} ref={el => { if (el) el.indeterminate = mixed }} className="sr-only" />
        <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${checked || mixed ? 'border-accent bg-accent text-on-fill' : 'border-slate-line'}`}>
          {checked && <CheckIcon className="h-2.5 w-2.5" />}
          {mixed && <span aria-hidden="true" className="h-0.5 w-2 rounded-full bg-current" />}
        </span>
        <span className={checked || mixed ? 'font-semibold text-ink' : ''}>{label}</span>
      </label>
    )
  }

  return options.map(opt => {
    if (!opt.children) {
      const checked = selected.has(opt.value)
      return row({ key: opt.value, checked, label: opt.label, onToggle: () => setValues([opt.value], !checked) })
    }
    const childValues = opt.children.map(c => c.value)
    const count = childValues.filter(v => selected.has(v)).length
    const all = count === childValues.length
    return [
      row({
        key: `parent:${opt.label}`,
        checked: all,
        mixed: count > 0 && !all,
        label: opt.label,
        onToggle: () => setValues(childValues, !all),
      }),
      ...opt.children.map(child => {
        const checked = selected.has(child.value)
        return row({ key: child.value, checked, label: child.label, indent: true, onToggle: () => setValues([child.value], !checked) })
      }),
    ]
  })
}
