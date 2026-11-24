// Late arrivals. The records, the admin form and the doctor's own view
// arrive with the late-arrivals work; until then this is the empty state.
export default function MyYearAttendance({ records = [] }) {
  return (
    <div className="space-y-4">
      <div className="sheen-divider">
        <span>Late arrivals</span>
        <span className="divider-meta normal-case font-normal">{records.length} this year</span>
      </div>
      <p className="card px-4 py-3 text-sm text-ink-muted">No late arrivals recorded.</p>
    </div>
  )
}
