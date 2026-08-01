const GITHUB_RULES_URL = 'https://github.com/vic-ec/RotaCat/blob/main/EC_LEAVE_PLANNER_RULES.md'
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-6KyFaVamlzcf2CjZdrrZEDa9OUFOOQ_bPsTV7i_GqI/edit'

function Section({ title, children }) {
  return (
    <div className="card p-5">
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-ink-light">{children}</div>
    </div>
  )
}

// The "Full policy" destination for InlineRuleHint's per-tab "How it
// works" links — a dedicated in-app page instead of only linking out to
// GitHub, per the mobile UX review's 3-layer rules recommendation
// (inline sentence -> expandable bullets -> full policy page). Content
// mirrors EC_LEAVE_PLANNER_RULES.md; update both together if the source
// sheet's rules change. Numeric caps aren't repeated here (they're
// tunable in Supabase without a redeploy) — see the Annual Leave tab for
// the current numbers.
export default function LeaveRulesPage() {
  return (
    <div className="space-y-4">
      <Section title="There are two planners">
        <p><strong>Annual Leave</strong> and <strong>Single Day/s, Courses, Special Leave + Weekend Request</strong>.</p>
        <p>The second is for days you want off, or a special request — these do <strong>not</strong> count as Annual Leave days. The requested shift/day is made up elsewhere, unless it&rsquo;s a &ldquo;special leave day.&rdquo;</p>
      </Section>

      <Section title="General rules (both planners)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Use <strong>surnames</strong> (not first names) when populating a planner.</li>
          <li>No more than one person per slot.</li>
          <li>Names are organised into groups and rotations. If your name appears in a specific colour for a given month, you work <strong>all</strong> the weekends in that colour that month.</li>
        </ul>
      </Section>

      <Section title="Annual Leave">
        <p>Applies to everyone working in EC — MOs, Registrars, EC Interns, Psych Interns, and Overtime Interns:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>An <strong>Annual Leave form must be submitted and approved</strong>. <strong>22 days</strong> annual leave are available per yearly cycle.</li>
          <li>If taking <strong>5 days&rsquo; leave</strong>, you may take the weekend on either side, but any &ldquo;on&rdquo; weekend hours must be made up elsewhere (on another weekend).</li>
          <li>If taking <strong>10 days&rsquo; leave (2 weeks)</strong> and the &ldquo;middle weekend&rdquo; is an &ldquo;on&rdquo; weekend, those hours do <strong>not</strong> need to be made up — they&rsquo;re included in the leave.</li>
          <li>If leave spans a period that includes a <strong>public holiday</strong>, the PH counts as a shift/leave day — or the hours are worked/made up elsewhere.</li>
          <li>All actual annual leave days taken (per the approved Leave Form) are shown in <strong>bold</strong> on the sheet.</li>
        </ul>
        <p>
          A hard cap on how many doctors from each category (MO, Registrar, EC COSMO/Intern, OT COSMO/Intern) can be on approved or pending annual leave at once is enforced automatically at submission — plus a combined cap across MO+Registrar+EC COSMO/Intern together. See the Annual Leave tab for the current numbers.
        </p>
        <p>
          <strong>Total days vs. annual leave days:</strong> you&rsquo;re unavailable for rostering for the whole date range you enter, but you separately state how many of those days actually count as annual leave — since that depends on the padding-weekend rules above and needs a human judgement call, not something derived automatically. E.g. a 7-day request covering a padding weekend might only be 5 annual leave days; the other 2 don&rsquo;t reduce your balance but still need their hours made up elsewhere. Every list of leave requests shows both numbers when they differ.
        </p>
      </Section>

      <Section title="Special / Single-day / Course leave">
        <ul className="list-disc space-y-1 pl-5">
          <li>Covers single days off, courses/CPD, and special leave requests.</li>
          <li>These do <strong>not</strong> count against the 22-day annual leave allowance.</li>
          <li>The requested day/shift is made up elsewhere, <strong>unless</strong> it&rsquo;s flagged as a &ldquo;special leave day.&rdquo;</li>
          <li>Pending requests of any leave type (including annual leave awaiting approval) also show on the Special tab, since they haven&rsquo;t been approved onto the Annual Leave planner yet.</li>
        </ul>
      </Section>

      <Section title="Weekend Request Planner">
        <ul className="list-disc space-y-1 pl-5">
          <li>Weekend rotations are organised in columns by MO / Registrar / EC COSMO / OT COSMO, colour-coded per doctor group.</li>
          <li>If your name is listed in a specific colour for a given month, you work <strong>every</strong> weekend in that colour that month.</li>
          <li>No more than one person per slot.</li>
        </ul>
      </Section>

      <Section title="How to request leave">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Submit the appropriate request from <strong>My leave</strong> — choose the correct leave type: Annual, Sick, Family responsibility, Study, Special, Prenatal, Maternity, Paternity, Workshop, Course/CPD, Conference, Single day, or Weekend exception.</li>
          <li>An admin reviews and approves (or rejects) the request before it&rsquo;s confirmed — approved annual leave then appears on the Annual Leave planner; everything else (and anything still pending) appears on the Special Leave planner.</li>
          <li>Populate/refer to the planner using <strong>surnames</strong>, matching the sheet&rsquo;s convention.</li>
        </ol>
      </Section>

      <p className="text-xs text-ink-muted">
        Source: <a href={SHEET_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink">EC Leave Planner sheet</a>
        {' · '}
        <a href={GITHUB_RULES_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink">Full written policy (EC_LEAVE_PLANNER_RULES.md)</a>
      </p>
    </div>
  )
}
