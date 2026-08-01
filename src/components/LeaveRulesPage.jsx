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
        <p>The second is for days you want off, or a special request — these do <strong>not</strong> count as Annual Leave days. The requested shift/day is made up elsewhere, unless it&rsquo;s a &ld[...]
      </Section>

      <Section title="General rules (both planners)">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Surnames</strong> are used to populate planners.</li>
          <li>No more than one person per slot.</li>
          <li>Names are organised into groups and rotations. If your name appears in a specific colour for a given month, you work <strong>all</strong> the weekends in that specific colour.</li>
        </ul>
      </Section>

      <Section title="Annual Leave">
        <p>Applies to everyone working in EC — MOs, Registrars, EC Interns, Psych Interns, and Overtime Interns:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>An <strong>Annual Leave form must be submitted and approved</strong>. <strong>22 days</strong> annual leave are available per yearly cycle.</li>
          <li>If taking <strong>5 days&rsquo; leave</strong>, you may take the weekend on either side, but any &ldquo;on&rdquo; weekend hours must be made up elsewhere (on another weekend).</li>
          <li>If taking <strong>10 days&rsquo; leave (2 weeks)</strong> and the &ldquo;middle weekend&rdquo; is an &ldquo;on&rdquo; weekend, those hours do <strong>not</strong> need to be made up — [...]</li>
          <li>If leave spans a period that includes a <strong>public holiday</strong>, the PH counts as a shift/leave day — or the hours are worked/made up elsewhere.</li>
          <li>All actual annual leave days taken (per the approved Leave Form) are shown in <strong>bold</strong> on the sheet.</li>

          <li>A maximum of 3 (three) doctors can be on leave at any given time. No more than 1 (one) EC Intern OR OT intern can be on leave at a time.</li>
          <li><strong>OT interns doing OT in the EC:</strong> please ensure you discuss your leave requests with your supervisor <strong>AND</strong> the EC rostering team to prevent double-bookings. [...]
        </ul>

        <p>
          <strong>Total days vs. annual leave days:</strong> you&rsquo;re unavailable for rostering for the whole date range you enter, but you separately state how many of those days actually count a[...]
        </p>
      </Section>

      <Section title="Special / Single-day / Course leave">
        <ul className="list-disc space-y-1 pl-5">
          <li>Covers single days off, courses/CPD, and special leave requests.</li>
          <li>These do <strong>not</strong> count against the 22-day annual leave allowance.</li>
          <li>The requested day/shift is made up elsewhere, <strong>unless</strong> it&rsquo;s flagged as a &ldquo;special leave day.&rdquo;</li>
          <li><strong>Courses:</strong> Courses taken to be specified on leave request. Days taken will count as official working hours/days</li>
			  <li>A formal Leave Form must be submitted and approved - Courses done will count as "Special Leave".</li>
			  <li>Please specify what course you are doing when requesting "Special Leave Days" e.g: Bottomley (ACLS)</li>
			  <li><strong>Single-Day-Off Requests:</strong> The requested SINGLE day off CANNOT be "TAILED ONTO" requests made as per LEAVE PLANNER above.</li>
			  <li>The requested SINGLE day off CANNOT be requested "in ADDITION TO" Annual leave requests as per LEAVE PLANNER above.</li>
			  <li>The requested SINGLE day off CAN be requested "in ADDITION TO" an "ON" W/E off request.</li>
			  <li>The SINGLE day requested off can be ANY day of the week - hours will be made up on another (roster beneficial) day.</li>
			  <li>The SINGLE day requested off can be ANY day of the week - hours will be made up on another (roster beneficial) day.</li>
			  <li>If the requested SINGLE day off is a FRIDAY - Indicate if wanted as a "Post-Call" day by adding (PC) in the leave request motivation.</li>
			  <li>If the requested FRIDAY is NOT a "Post-Call" day - The hours will be made-up on another day.</li>
			  <li>A SINGLE W/E Day on an "ON" W/E can also be requested - The W/E day will be worked back on another W/E during month.</li>
        </ul>
      </Section>

      <Section title="Weekend Requests Planner">
        <ul className="list-disc space-y-1 pl-5">
          <li>Weekend rotations are organised in columns by MO / Registrar / EC COSMO/Intern / OT COSMO/Intern, colour-coded per doctor group.</li>
          <li>If your name is listed in a specific colour for a given month, you work <strong>every</strong> weekend in that colour that month.</li>
          <li>No more than one person per slot.</li>
          <li>If you request an "ON" W/E off - you will be rostered on one of your "OFF" W/E's (to make up your W/E hours).</li>
          <li>If you do not want this - You have to put in for Leave Days. Please indicate the number of annual leave days you wish to take. A formal Leave Form will have to be submitted as per normal[...]</li>
          <li>The request will be captured on the LEAVE PLANNER and WEEKEND PLANNER if approved.</li>
          <li>This specific "off" W/E off will be CONSIDERED - but will be ROSTER NEEDS DEPENDENT.</li>
        </ul>
      </Section>

      <Section title="How to request leave">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Submit the appropriate request from <strong>My leave</strong> — choose the correct leave type: Annual, Sick, Family responsibility, Study, Special, Prenatal, Maternity, Paternity, Work[...]</li>
          <li>An admin reviews and approves (or rejects) the request before it&rsquo;s confirmed — approved annual leave then appears on the Annual Leave planner; everything else (and anything still[...]</li>
          <li>Populate/refer to the planner using <strong>surnames</strong>, matching the sheet&rsquo;s convention.</li>
        </ol>
      </Section>

      <p className="text-xs text-ink-muted">
        Source: <a href={SHEET_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink">EC Leave Planner sheet</a>
        {' · '}
        <a href={GITHUB_RULES_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink">EC Leave Rules</a>
      </p>
    </div>
  )
}
