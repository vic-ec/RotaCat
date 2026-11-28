import { CircleQuestionMark, ScrollText } from 'lucide-react'

// The Rotations page's More actions, shared by its three tabs' kebab
// (RotationsMoreMenu) and their phone FAB. Kept apart from the components
// in RotationsToolbarParts so that file exports components only.
export const ROTATIONS_PAGE_TITLE = 'Intern & Registrar Rotations'

export const ROTATIONS_MENU_ITEMS = [
  { key: 'how-it-works', icon: <CircleQuestionMark className="h-4 w-4" />, label: 'How it works', disabled: true, onClick: () => {} },
  { key: 'review-log', icon: <ScrollText className="h-4 w-4" />, label: 'Review log', disabled: true, onClick: () => {} },
]
