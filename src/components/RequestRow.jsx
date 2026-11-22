import ProfileAvatar from './ProfileAvatar'
import RowActionIcon from './RowActionIcon'

// One row shape for the Staff page's two admin queues (Account Requests,
// User Requests): avatar · name over a plain meta line · icon actions on
// the right. No tick boxes — a decision is one tap per row.
//
//   meta          the line under the name (role or category, plain text)
//   detail        a second line under the meta, when the row has a value
//                 to show (an email change: old → new)
//   column        shown as its own column on a desktop (a registration
//                 date); on a phone it collapses into `columnIcon`, a titled
//                 icon placed left of the actions
//   actions       [{ icon, title, label, onClick, tone, disabled }], drawn
//                 as RowActionIcons — view, approve (success), reject
//                 (danger) in that order
//   children      anything else below the row (a reason, a warning)
export default function RequestRow({ person, name, meta, detail, column, columnIcon, actions, onClick, children }) {
  return (
    <div className={onClick ? 'cursor-pointer transition-colors hover:bg-canvas-sunken' : ''}>
      <div className="flex items-center gap-3 px-4 py-2" onClick={onClick}>
        <span className="flex-shrink-0 md:hidden"><ProfileAvatar profile={person} size={40} /></span>
        <span className="hidden flex-shrink-0 md:block"><ProfileAvatar profile={person} size={30} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-ink-muted">{meta}</p>}
          {detail && <p className="mt-0.5 truncate text-xs text-ink-light">{detail}</p>}
        </div>
        {column && <p className="hidden w-44 flex-shrink-0 text-xs text-ink-muted md:block">{column}</p>}
        {/* Four icons at 36px would push a longer name into an ellipsis on
            a 390px phone, so the row's icons sit flush and the column icon
            takes less width than a tappable action. */}
        <div className="-mr-1.5 flex flex-shrink-0 items-center md:mr-0 md:gap-0.5">
          {columnIcon && (
            <span className="flex h-9 w-7 items-center justify-center text-ink-muted md:hidden" title={column} aria-label={column}>{columnIcon}</span>
          )}
          {actions.map(a => (
            <RowActionIcon key={a.title} icon={a.icon} title={a.title} label={a.label} onClick={a.disabled ? undefined : a.onClick} tone={a.tone} />
          ))}
        </div>
      </div>
      {children && <div className="px-4 pb-3 pl-[68px] md:pl-[58px]">{children}</div>}
    </div>
  )
}
