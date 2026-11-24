// A dashboard panel as stacked rows: a label on the left (200px from md;
// above the people on a phone) and the people side by side on the right,
// wrapping only when a row is full. Rows are only as tall as their names
// need, so a panel never has one long column beside a half-empty one.
// Used by On shift, Team leave and Sick leave on the admin Dashboard.
export function PanelRows({ children, testId }) {
  return <ul className="divide-y divide-slate-line" data-testid={testId}>{children}</ul>
}

export function PanelRow({ label, empty, tint = false, children, testId }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return (
    <li data-testid={testId} className={`grid gap-2.5 px-4 py-3.5 md:grid-cols-[200px_minmax(0,1fr)] md:items-start md:gap-4 ${tint ? 'bg-canvas-cool' : ''}`}>
      <div className="min-w-0">{label}</div>
      {items.length === 0
        ? <p className="text-sm text-ink-muted md:pt-1.5">{empty}</p>
        : <ul className="flex flex-wrap gap-x-5 gap-y-2.5">{items}</ul>}
    </li>
  )
}

// The usual left-hand label: a small tag above a bolder line.
export function PanelLabel({ tag, title }) {
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{tag}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{title}</p>
    </>
  )
}
