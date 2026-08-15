// Single source of truth for staff_category display labels.
//
// These were previously redeclared in StaffListPage.jsx,
// GenerationConfigPage.jsx, RosterSummaryPage.jsx and AppLayout.jsx, and had
// drifted apart — the *_COSMO_Intern values in particular were collapsed onto
// the plain EC/OT Intern labels on two pages and spelled out in full on a
// third. The distinct spelling wins here: collapsing them loses the COSMO
// distinction, which is real (a COSMO on an EC rotation is not an EC intern).
export const CATEGORY_LABELS = {
  MO:              'Medical Officer',
  Registrar:       'Registrar',
  COSMO:           'COSMO',
  COSMOPsych:      'COSMO (Psych)',
  Intern:          'Intern',
  Consultant:      'Consultant',
  Locum:           'Locum',
  // Future values (dormant until Jan 2027)
  EC_Intern:       'EC Intern',
  EC_COSMO_Intern: 'EC COSMO Intern',
  OT_Intern:       'OT Intern',
  OT_COSMO_Intern: 'OT COSMO Intern',
}

// Convenience for the common `LABELS[key] || key` fallback.
export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category
}
