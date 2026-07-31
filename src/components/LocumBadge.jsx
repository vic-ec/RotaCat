// Small pill flagging a locum in review-log tables — same visual language
// as the role badge on the Staff page (bg-canvas-sunken/text-ink-muted).
export default function LocumBadge() {
  return (
    <span className="ml-1 inline-block rounded-full bg-canvas-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-muted align-middle">
      Locum
    </span>
  )
}
