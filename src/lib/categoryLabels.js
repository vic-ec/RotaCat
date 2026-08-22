// Single source of truth for staff_category display labels.
//
// These were previously redeclared in StaffListPage.jsx,
// GenerationConfigPage.jsx, RosterSummaryPage.jsx and AppLayout.jsx, and had
// drifted apart.
//
// Two kinds of value live in this enum and both need a label. MO,
// Registrar, Intern, Consultant and Locum are IDENTITIES — what a person
// is, as stored on their profiles row. EC_Intern and OT_Intern are
// RESOLVED categories — what an Intern works out to on a given date, once
// contract_type and their intern_rotations block are known — and appear on
// weekend_planner rows rather than on people.
export const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  Intern:     'Intern',
  Consultant: 'Consultant',
  Locum:      'Locum',
  // Resolved-only (never assigned to a person)
  EC_Intern:  'EC Intern',
  OT_Intern:  'OT Intern',
}

// Convenience for the common `LABELS[key] || key` fallback.
export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category
}
