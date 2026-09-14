// The Sort facet shared by the two admin doctor tables — Hours Summary and
// All Leave. It lived in RosterSummaryPage until All Leave needed the same
// four options; one copy means the two tables can never drift into sorting
// "MO → Registrar → Intern" differently from each other.
//
// Rows need `category`, `name` and `surname`. Anything else about them is
// the caller's business.

// Sort's fixed category priority: MO, then Registrar, then every Intern-type
// category (EC before OT within that group) — everything else (COSMO,
// COSMOPsych, Locum) sorts after, in whatever order the rows already came
// in (stable sort). Returns [primaryRank, secondaryRank]; 'desc' just
// reverses the comparator's sign rather than needing its own rank table.
function categorySortRank(category) {
  if (category === 'MO') return [0, 0]
  if (category === 'Registrar') return [1, 0]
  if (category === 'EC_Intern' || category === 'EC_COSMO_Intern') return [2, 0]
  if (category === 'OT_Intern' || category === 'OT_COSMO_Intern') return [2, 1]
  if (category === 'Intern') return [2, 2]
  return [3, 0]
}

function compareByCategoryPriority(a, b) {
  const [ap, as] = categorySortRank(a.category)
  const [bp, bs] = categorySortRank(b.category)
  return ap !== bp ? ap - bp : as - bs
}

function compareByName(a, b) {
  const an = `${a.surname} ${a.name}`.toLowerCase()
  const bn = `${b.surname} ${b.name}`.toLowerCase()
  return an < bn ? -1 : an > bn ? 1 : 0
}

export const DEFAULT_DOCTOR_SORT = 'category-asc'

export const DOCTOR_SORT_OPTIONS = [
  { value: 'category-asc', label: 'MO → Registrar → Intern' },
  { value: 'category-desc', label: 'Intern → Registrar → MO' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
]

export const DOCTOR_SORT_COMPARATORS = {
  'category-asc': compareByCategoryPriority,
  'category-desc': (a, b) => compareByCategoryPriority(b, a),
  'name-asc': compareByName,
  'name-desc': (a, b) => compareByName(b, a),
}

// The contract a doctor is on, as a filter dimension. Same order and labels
// in both tables.
export const CONTRACT_TYPE_ORDER = ['full', 'five_eighths', 'Junior_Doctor_Overtime']
export const CONTRACT_TYPE_LABEL = { full: 'Full-time', five_eighths: '⅝', Junior_Doctor_Overtime: 'OT' }
