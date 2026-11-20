// Shared rule for when ExpandAllButton appears under a grouped table.
// Every grouped table decides "show it?" with allSectionsCollapsed so the
// rule is the same everywhere: there is at least one section on screen and
// every one of them is folded. Pass the sections actually rendered (empty
// sections that are hidden don't count) and the collapsed-state map keyed
// by section key.
export function allSectionsCollapsed(sections, collapsed) {
  return sections.length > 0 && sections.every(section => Boolean(collapsed?.[section.key]))
}

