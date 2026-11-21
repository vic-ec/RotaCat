import {
  TreePalm, Thermometer, BoneFracture, HeartHandshake, Sparkles, BookOpen, GraduationCap,
  Presentation, HeartPulse, Baby, TimerReset, Calendar1, Coffee,
} from 'lucide-react'
import { LEAVE_GROUP_COLOR, leaveTypeGroupKey } from '../lib/leaveMatrix'

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
//          panels); the tint is the colour at low alpha, so it sits on a
//          light or a night surface alike.
//          'bare' — the glyph alone, in `color` (default the group colour);
//          for inside a solid bar or beside a label.
export default function LeaveTypeIcon({ leaveType, groupKey, variant = 'box', size = 'md', color, className = '' }) {
  const group = groupKey ?? leaveTypeGroupKey(leaveType)
  const Icon = (leaveType && TYPE_ICON[leaveType]) || GROUP_ICON[group] || Coffee
  const tone = color ?? LEAVE_GROUP_COLOR[group]
  if (variant === 'bare') {
    return <Icon aria-hidden="true" data-leave-icon={leaveType ?? group} className={`flex-shrink-0 ${GLYPH[size]} ${className}`} style={{ color: tone }} />
  }
  return (
    <span
      aria-hidden="true"
      data-leave-icon={leaveType ?? group}
      className={`inline-flex flex-shrink-0 items-center justify-center border ${BOX[size]} ${className}`}
      style={{ backgroundColor: `${tone}1F`, borderColor: `${tone}66`, color: tone }}
    >
      <Icon className={GLYPH[size]} />
    </span>
  )
}
