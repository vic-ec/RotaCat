import {
  TreePalm, Thermometer, BoneFracture, HeartHandshake, Sparkles, BookOpen, GraduationCap,
  Presentation, HeartPulse, Baby, TimerReset, Calendar1, Coffee,
} from 'lucide-react'
import { leaveGroupInk, leaveTypeGroupKey } from '../lib/leaveMatrix'
import { leaveTypeCode, LEAVE_TYPE_LABELS } from '../lib/leaveRequests'

// One icon per leave type, in its group's colour (LEAVE_GROUP_COLOR). The
// icon says which type, the colour which family — and it is what tells a
// leave marker from a rotation marker, which is a plain colour square in
// several of the same colours. Lucide icons, never emojis.
//
// Workshop and Conference share one icon, as do Maternity and Paternity,
// and Public holiday and Single day — deliberately: they are the same kind
// of absence to someone reading a list.
const TYPE_ICON = {
  annual: TreePalm,
  sick: Thermometer,
  injury_on_duty: BoneFracture,
  family_responsibility: HeartHandshake,
  special_leave: Sparkles,
  study: BookOpen,
  course: GraduationCap,
  workshop: Presentation,
  conference: Presentation,
  prenatal: HeartPulse,
  maternity: Baby,
  paternity: Baby,
  time_off_in_lieu: TimerReset,
  statutory_public: Calendar1,
  single_day: Calendar1,
  weekend_exception: Coffee,
}

// A legend entry stands for a whole group: its most typical type's icon.
const GROUP_ICON = {
  annual: TreePalm, sick: Thermometer, family: HeartHandshake, study: BookOpen,
  parental: Baby, lieu: TimerReset, weekend: Coffee,
}

const BOX = { sm: 'h-5 w-5 rounded-[5px]', md: 'h-[26px] w-[26px] rounded-[7px]' }
const GLYPH = { sm: 'h-3 w-3', md: 'h-[15px] w-[15px]' }

// `leaveType` for one type, or `groupKey` for a legend's group.
// variant: 'box' — the icon in a tinted, outlined box (lists, legends,
//          panels); ink from --leave-ink-* (lifted at night), the tint
//          and outline mixed from that same ink.
//          'bare' — the glyph alone, in `color` (default the group colour);
//          for inside a solid bar or beside a label.
export default function LeaveTypeIcon({ leaveType, groupKey, variant = 'box', size = 'md', color, className = '' }) {
  const group = groupKey ?? leaveTypeGroupKey(leaveType)
  const Icon = (leaveType && TYPE_ICON[leaveType]) || GROUP_ICON[group] || Coffee
  const tone = color ?? leaveGroupInk(group)
  if (variant === 'bare') {
    return <Icon aria-hidden="true" data-leave-icon={leaveType ?? group} className={`flex-shrink-0 ${GLYPH[size]} ${className}`} style={{ color: tone }} />
  }
  return (
    <span
      aria-hidden="true"
      data-leave-icon={leaveType ?? group}
      className={`inline-flex flex-shrink-0 items-center justify-center border ${BOX[size]} ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`,
        color: tone,
      }}
    >
      <Icon className={GLYPH[size]} />
    </span>
  )
}

// A leave type as a filled pill: its group's colour, its icon and its short
// code ("SK"), for a dense grid (the roster's Leave and Course columns)
// where a name sits beside it. The fill is the group's ink (lifted at night)
// and the text the raised card colour, so it reads on both themes.
export function LeaveTypePill({ leaveType, className = '' }) {
  const group = leaveTypeGroupKey(leaveType)
  const Icon = (leaveType && TYPE_ICON[leaveType]) || GROUP_ICON[group] || Coffee
  const code = leaveTypeCode(leaveType)
  return (
    <span
      data-testid="leave-type-pill"
      title={LEAVE_TYPE_LABELS[leaveType] || undefined}
      className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[0.75em] font-bold leading-tight ${className}`}
      style={{ backgroundColor: leaveGroupInk(group), color: 'rgb(var(--color-canvas-raised))' }}
    >
      <Icon className="h-[1em] w-[1em] flex-shrink-0" aria-hidden="true" />
      {code}
    </span>
  )
}
