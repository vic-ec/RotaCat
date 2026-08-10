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
      <Section title="There are three planners">
        <p><strong>Annual Leave</strong> and <strong>Single Day/s, Courses, Special Leave</strong> and <strong>Weekend Request Planners.</strong></p>
        <p>The second is for days you want off, or a special request — these do <strong>not</strong> count as Annual Leave days. The requested shift/day is made up elsewhere, unless it’s a special leave day.</p>
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
          <li>If taking <strong>5 days’ leave</strong>, you may take the weekend on either side, but “on” weekend hours must be made up elsewhere (on another weekend).</li>
          <li>If taking <strong>10 days’ leave (2 weeks)</strong> and the “middle” weekend is an “on” weekend, those hours do <strong>not</strong> need to be made up — they are included in the leave.</li>
          <li>If leave spans a period that includes a <strong>public holiday</strong>, the PH counts as a shift/leave day — or the hours are worked/made up elsewhere.</li>
          <li>All actual annual leave days taken (per the approved Leave Form) are shown in the planner.</li>
          <li>A maximum of 3 (three) doctors can be on leave at any given time. No more than 1 (one) EC Intern OR OT intern can be on leave at a time.</li>
          <li><strong>OT interns doing OT in the EC:</strong> please ensure you discuss your leave requests with your supervisor <strong>AND</strong> the EC rostering team to prevent double-bookings.</li>
        </ul>

        <p>
          <strong>Total days vs. annual leave days:</strong> You are unavailable for rostering for the whole date range you are approved for, but you separately state how many of those days actually count as annual leave - since that depends on the padding-weekend rules above and needs a human judgement call, not something derived automatically. E.g.: a 7-day request covering a padding weekend might only be 5 annual leave days; the other 2 don’t reduce your balance but still need their hours made up elsewhere. Every list of leave requests shows both numbers when they differ.
        </p>
      </Section>

      <Section title="Special / Single-day / Course leave">
        <ul className="list-disc space-y-1 pl-5">
          <li>Covers single days off, courses/CPD, and special leave requests.</li>
          <li>These do <strong>not</strong> count against the 22-day annual leave allowance.</li>
          <li>The requested day/shift is made up elsewhere, <strong>unless</strong> it is flagged as a special leave day.</li>
        </ul>

        <div>
          <strong>Courses:</strong>
          <ul className="list-disc space-y-1 pl-5">
            <li>Courses taken to be specified on leave request. Days taken will count as official working hours/days</li>
            <li>A formal Leave Form must be submitted and approved - Courses done will count as “Special Leave”.</li>
            <li>Please specify what course you are doing when requesting “Special Leave Days” e.g.: Bottomley (ACLS)</li>
          </ul>
        </div>

        <div>
          <strong>Single-Day-Off Requests:</strong>
          <ul className="list-disc space-y-1 pl-5">
            <li>The requested SINGLE day off CANNOT be “TAILED ONTO” requests made as per LEAVE PLANNER above.</li>
            <li>The requested SINGLE day off CANNOT be requested “in ADDITION TO” Annual leave requests as per LEAVE PLANNER above.</li>
            <li>The requested SINGLE day off CAN be requested “in ADDITION TO” an “ON” W/E off request.</li>
            <li>The SINGLE day requested off can be ANY day of the week - hours will be made up on another (roster beneficial) day.</li>
            <li>If the requested SINGLE day off is a FRIDAY - Indicate if wanted as a “Post-Call” day by adding (PC) in the leave request motivation.</li>
            <li>If the requested FRIDAY is NOT a “Post-Call” day - The hours will be made-up on another day.</li>
            <li>A SINGLE W/E Day on an “ON” W/E can also be requested - the W/E day will be worked back on another W/E during the month.</li>
          </ul>
        </div>
      </Section>

      <Section title="Weekend Requests Planner">
        <ul className="list-disc space-y-1 pl-5">
          <li>Weekend rotations are organised in columns by MO / Registrar / EC Intern / OT Intern, colour-coded per doctor group.</li>
          <li>If your name is listed in a specific colour for a given month, you work <strong>every</strong> weekend in that colour that month.</li>
          <li>No more than one person per slot.</li>
        </ul>

        <div>
          <strong>Requests for Weekend Exceptions (“weekends off”):</strong>
          <ul className="list-disc space-y-1 pl-5">
            <li>If you request an “ON” weekend off, you will be rostered on one of your “OFF” weekends to make up your weekend hours.</li>
            <li>If you do not want this, then you have to put in annual leave days.</li>
            <li>Please indicate the number of annual leave days you wish to take when submitting your leave request.</li>
            <li>If the request is approved, it will be captured on the LEAVE PLANNER and WEEKEND PLANNER.</li>
            <li>If you do not put in leave days, this specific “off” weekend request will be CONSIDERED <strong>subject to rostering requirements.</strong></li>
          </ul>
        </div>
      </Section>

      <Section title="How to request leave">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Submit the appropriate request from <strong>My leave</strong> — choose the correct leave type: Annual, Sick, Study, Special, etc.</li>
          <li>Please indicate the number of annual leave days you will be taking - please refer to the guidelines above.</li>
          <li>Indicate any motivations / additional requests in the <strong>Motivations</strong> section.</li>
          <li>Please note that <strong>incorrect or misrepresented</strong> leave requests will be rejected.</li>
          <li>An admin reviews and approves (or rejects) the request before it is confirmed.</li>
          <li>Approved annual leave then appears on the Annual Leave planner; everything else will appear on the Special Leave Planner.</li>
          <li>Requests for “Weekend Exceptions” that are approved will appear on the Weekend Planner.</li>
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
