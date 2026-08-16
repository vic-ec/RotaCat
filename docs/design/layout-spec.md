# RotaCat — Page Layout Specification

Version 1.0 — derived from review of Account, Staff (Pending Approvals), and Roster pages.

Purpose: a single reference for building new pages and refactoring existing ones so headers, toolbars, lists, tags, and forms behave and look identical everywhere.

---

## Implementation notes (deviations from the v1.0 tokens below)

Recorded during the Phase 1 audit / Phase 2 plan, before Phase 3 build-out. Where the app's existing, already-tuned values conflict with §1's literal numbers, the app's values won — introduced net-new here would mean either a much larger app-wide visual change than a 3-page layout pass, or a redundant second "standard" living next to the one already shipped everywhere.

- **Spacing**: no separate `--space-*` scale was added — Tailwind's default spacing scale (`1`=4px, `2`=8px, `4`=16px, `6`=24px, `8`=32px) already covers §1's xs/sm/md/lg/xl exactly, so it *is* the token system. "Never hardcode a value" means "use the Tailwind spacing utility," not "invent a parallel named scale."
- **Sidebar width**: 240px (`w-60`, AppLayout's existing sidebar), not 190px — the current width is already fitted to the nav's icons/labels/badges; shrinking it is a separate, app-wide visual decision outside this pass. Tokenized as `w-sidebar`/`spacing.sidebar` in `tailwind.config.js` at 240px (15rem).
- **Radius**: kept at the app's existing `rounded` (8px) / `rounded-lg` (12px), not shrunk to the spec's 6px/10px — those two values are already used on effectively every button, input, tag, and card in the app, so changing them is an app-wide restyle, not a 3-page one.
- **Content max-width**: two tiers instead of one flat 1120px — `max-w-2xl` (672px) for list/detail/form pages (Roster, Account, Staff's Pending Approvals/User Requests), `max-w-7xl` (1280px) for the Staff data table, which needs the extra width for its columns. 1120px sat awkwardly between both and fit neither.
- **Role/category tag color**: reuses the app's existing neutral `bg-canvas-sunken text-ink-muted` pairing (already used for the Locum/Clerk badges) rather than introducing the spec's `#EEF1F6`/`#3A4560` as new hex values — one neutral pairing, not two near-identical ones.
- **Typography**: added as opt-in Tailwind `fontSize` tokens (`text-h1`, `text-h2`, `text-section-label`, `text-body`, `text-meta`) for the new shared components to build on — additive, nothing existing was switched over automatically. `--font-body`'s 14px already matches the app's existing `text-sm` body-copy convention, so no separate value was needed there.
- **Breakpoints**: Tailwind's default `md` (768px) / `lg` (1024px) already match the spec's tablet/desktop split exactly, spelled out explicitly in `tailwind.config.js`'s `screens` for clarity rather than left implicit.

---

## 1. Design tokens

Define these once (CSS variables / theme file) and reference everywhere — never hardcode values in a page component.

```css
:root {
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Layout */
  --sidebar-width: 190px;
  --content-max-width: 1120px;   /* prevents sparse pages like Roster from over-stretching */
  --content-padding-x: 32px;
  --content-padding-top: 32px;

  /* Breakpoints */
  --bp-mobile-max: 599px;   /* phones */
  --bp-tablet-max: 1023px;  /* tablets / small laptops */
  /* Desktop = >= 1024px, the layouts already reviewed */

  /* Radius */
  --radius-sm: 6px;   /* buttons, tags, inputs */
  --radius-md: 10px;  /* cards, rows, panels */

  /* Typography */
  --font-h1: 600 26px/1.3 var(--font-family);
  --font-h2: 600 15px/1.4 var(--font-family);       /* section labels use this at smaller size, see below */
  --font-section-label: 600 11px/1.4 var(--font-family); /* all-caps, letter-spacing 0.04em */
  --font-body: 400 14px/1.5 var(--font-family);
  --font-meta: 400 12px/1.4 var(--font-family);      /* timestamps, subtext */

  /* Color — role vs status kept in separate palettes */
  --color-role-bg: #EEF1F6;   --color-role-text: #3A4560;      /* neutral, used for role/category tags */
  --color-status-success-bg: #E3F5EC; --color-status-success-text: #1E8A5A; /* Published / Approved */
  --color-status-warning-bg: #FDF3E1; --color-status-warning-text: #B5790C; /* Draft / Pending */
  --color-status-danger-bg:  #FCEAEA; --color-status-danger-text:  #C23B3B; /* Rejected / Delete */

  --color-border: #E7E9EE;
  --color-text-primary: #1A1D24;
  --color-text-secondary: #6B7280;
  --color-accent: #1E8A73; /* RotaCat teal */
}
```

**Rule:** role/category tags (e.g. "Registrar", "Consultant") always use the neutral role palette. Status tags (e.g. "Published", "Draft", "Pending") always use the semantic success/warning/danger palette. Never reuse green for both — this was the bug found on the current Staff and Roster pages.

---

## 2. Page shell (applies to every page)

```
┌─────────────┬──────────────────────────────────────────────┐
│             │  PageHeader                                   │
│   Sidebar   │  Breadcrumb (optional)                        │
│  (fixed,    │  Toolbar (optional: search / sort / filter)   │
│  190px)     │  Section label + content list/grid/form       │
│             │                                                │
└─────────────┴──────────────────────────────────────────────┘
```

- Content column max-width: `1120px`, left-aligned with `32px` padding — do not let single-column lists stretch full-bleed on wide monitors (this is what makes Roster look sparse). If a page has few items, either cap the column width or switch to a card/grid layout (see §7).
- Vertical rhythm between header → breadcrumb → toolbar → content: `24px` each.

---

## 3. Component: PageHeader

Every page gets exactly one, at the very top of the content column.

| Slot | Rule |
|---|---|
| Title (H1) | Always present. Plain text, no icon. e.g. "Rosters", "Staff", "Account" |
| Primary action button | Top-right, only if the page has one clear primary create/add action (e.g. "Create roster"). Omit entirely rather than adding a decorative one. |
| Count badge | Optional, inline next to title or on a tab (e.g. "Pending Approvals ①") — reserved for items needing attention, not general counts |

**Fix required:** Account and Pending Approvals currently have no H1 — add "Account" and "Staff" respectively.

---

## 4. Component: Breadcrumb

Use only when it adds navigation info not already available from tabs or the sidebar.

- Style: `← Label` in `--color-text-secondary`, `14px`, sits directly under the H1 (or under tabs if tabs exist).
- **Do not** show a breadcrumb that duplicates an active tab (current bug: "← All staff" under the "All Staff" tab on Pending Approvals — remove).
- **Do not** show "← Staff" on the Account page — Account is a top-level destination, not a drill-down from Staff.
- Valid use case: drilling into a specific record, e.g. `Roster > August 2026 > Shift #12`.

---

## 5. Component: Toolbar

Fixed left-to-right order, used identically on every list page — every page's
search/sort/filter row goes through the one shared `Toolbar` component
(`src/components/Toolbar.jsx`), not a hand-rolled equivalent:

```
[ Search input ] [ Sort ▾ ] [ Filter ▾ ] [ desktopTrailing ] [ × Clear (conditional) ] [ trailing ]
```

| Element | Spec |
|---|---|
| Search input | Fixed width **320px** on desktop (`compact` prop shrinks this instead, for a row that must never wrap — see below). Placeholder always states exactly what's searched, e.g. "Search by surname or first name…", "Search by month or year…" — never a generic "Search…" |
| Sort | Include on every list with more than ~5 items and a meaningful order (name, date, status). Passed as `sortFacets` — single-select. |
| Filter | Two shapes, pick whichever matches the data: `filterFacets` (single-select, one dropdown per facet — e.g. Roster's Sort direction) or `filterGroups` (multi-select, `FilterPanel`-shaped groups behind one `[Filter ▾ (n)]` trigger — e.g. Staff's Role/Category/Status/Admin). Both can be passed together. |
| Clear (×) | **Only rendered when a search term or filter is active** (`active` prop) — never shown by default. |
| `trailing` / `desktopTrailing` | An extra control appended after Clear (`trailing`, both breakpoints — e.g. a `ViewToggle`) or before Clear on desktop only (`desktopTrailing` — a nav cluster mobile already renders elsewhere). |
| Active filter chips | Not currently implemented — filter state is only visible via each facet/FilterPanel's own active-count badge. |

**Mobile behavior** — two modes via `mobileMode`:
- `"sheet"` (default): Sort/Filter facets collapse into one "Filters" bottom sheet trigger (§15). `filterGroups`, if passed, still renders as its own always-visible `FilterPanel` trigger — it's never swept into the sheet.
- `"inline"`: every facet renders as its own always-visible button on mobile too, same as desktop — no sheet. This replaced the standalone `CompactToolbarRow` component, which offered only this behavior and has been removed; pass `mobileMode="inline"` on `Toolbar` instead.

---

## 6. Component: Section label

Use to group related items within a page (Drafts vs Published, Contact Details vs Security).

```
DRAFTS (2)                                    ← --font-section-label, all-caps, --color-text-secondary
┌──────────────────────────────────────────┐
│ row                                       │
│ row                                       │
└──────────────────────────────────────────┘
```

- Replace Roster's current bare checkbox-and-label row with this styled label (borrowed from Account's CONTACT DETAILS / SECURITY & ACCESS pattern).
- Optional leading checkbox only if bulk "select all in group" is a real feature — otherwise drop it from the label row and keep checkboxes only on individual rows.

---

## 7. Component: List row

Two accepted row variants — pick one per data type, never mix within the same list.

**Variant A — Identity row** (people): checkbox → avatar → name → role tag → meta subtext → actions, right-aligned.
**Variant B — Record row** (rosters, documents): checkbox → title → subtitle/date → status tag → chevron, right-aligned.

| Property | Spec |
|---|---|
| Row height | 56px minimum, consistent across all lists |
| Padding | 16px horizontal |
| Hover state | Light background tint (`#F7F8FA`), applies to every list row app-wide |
| Selected state | `--color-accent` tinted background + border, same on every list |
| Trailing icon | `>` chevron = navigates to a new screen/panel. Never mix with `˅` (expand) inside the same row type. |
| Row-level actions | Max 2–3 icon buttons; always include a `title` tooltip. If clicking the row already opens detail, drop a redundant standalone "view" icon (currently duplicated on Pending Approvals). |

**Empty state:** every list needs one — icon/illustration + one-line message + primary action if applicable (e.g. no rosters yet → "Create roster" button inline).

---

## 8. Component: Bulk action toolbar

Appears in place of (or pinned above) the section label the moment ≥1 row is checked. Same position and styling everywhere "select all" exists.

```
3 selected     [ Approve ]  [ Reject ]  [ Cancel ]
```

- Left: live count of selected items.
- Right: contextual actions relevant to that list (Approve/Reject for approvals, Archive/Delete for rosters).
- Always include a "Cancel selection" affordance.

---

## 9. Component: Tag / Pill

| Type | Palette | Examples |
|---|---|---|
| Role / category tag | Neutral (`--color-role-*`) | Registrar, Consultant, Nurse |
| Status tag | Semantic (`--color-status-*`) | Draft (warning), Published (success), Pending (warning), Rejected (danger) |

Shape: `--radius-sm`, `4px 10px` padding, `12px` medium-weight text, no border.

---

## 10. Component: Settings-style grouped list (Account page pattern)

Reusable for any "list of expandable/navigable settings" page:

```
SECTION LABEL
┌───────────────────────────────────────────┐
│ 🔒  Change password                     ˅  │
│ 🛡  Roles & Permissions                  ˅  │
└───────────────────────────────────────────┘
```

- Icon (left) + label + trailing indicator (right).
- **Trailing indicator rule:** `˅` = expands inline in place; `>` = navigates to a new screen or opens a modal. Audit every row on Account and correct — several currently use `˅` but likely navigate.
- "Danger Zone" treatment (tinted red border/background) is reserved for destructive-action groups only — reuse this exact style anywhere else a destructive action exists (e.g. deleting a roster, removing a staff member).

---

## 11. Component: Form / Modal (for future build-out)

Standardize now before more forms get built:

| Property | Spec |
|---|---|
| Max width | 520px, centered if modal; single column always |
| Label position | Above input, `--font-meta` weight 600 |
| Field spacing | 16px vertical between fields |
| Footer | Right-aligned, secondary button ("Cancel") then primary button, 8px gap |
| Validation | Inline below field, red text, no color-only signaling (add icon too) |

---

## 12. Component: Master–detail panel (recommended new pattern)

For Staff and Roster, replace full navigation to a new page with a right-hand slide-in panel (40% width, min 420px) when a row is clicked:

- Keeps list context visible while reviewing a record.
- Gives Pending Approvals a natural home for the "preview" action without a dedicated eye icon — clicking the row opens the panel.
- Panel gets its own mini-header (name/title + close ×) but does not duplicate the page's PageHeader.

---

## 13. Page-to-template mapping

| Page | Template | Fixes to apply |
|---|---|---|
| Account | Settings-style grouped list (§10) | Add H1 "Account"; remove "← Staff" breadcrumb; fix chevron vs pencil consistency; add phone verification badge |
| Staff → Pending Approvals | List page w/ tabs (§3–§9) | Add H1 "Staff"; remove redundant breadcrumb; widen search to 320px; hide Clear button when idle; neutral-color the role tag; add tooltips to action icons; consider dropping standalone "view" icon in favor of row-click → detail panel |
| Roster | List page w/ tabs (§3–§9) + consider grid variant | Apply section-label styling to Drafts/Published; add Sort control; cap content width or switch to card grid (§14) to remove excess whitespace; add Sort |

---

## 14. Optional structural upgrades

- **Roster as a card grid** instead of single-column list once space feels sparse: 2–3 columns, each card showing month, status tag, and a mini-stat line (e.g. "18 shifts · 12 staff · edited 2 days ago").
- **Dashboard as a real landing page**: surface "Pending approvals (1)", "Drafts awaiting publish (2)" as jump-link cards rather than requiring the admin to check each section manually.
- **Consistent "needs attention" badge language**: the red numeric badge used on Staff should be the one and only pattern used anywhere something needs action (Roster drafts, Planners, etc.).
- **Shared `<PageHeader>` and `<Toolbar>` components**: enforce this spec in code by extracting these as components used by every page, rather than re-implemented per page — this is what caused the current drift between pages.

---

## 15. Responsive / mobile layout

All of §1–§12 describe the desktop (>=1024px) layouts already reviewed. Every shared component must also define tablet and mobile behavior — do not treat mobile as an afterthought bolted on later.

### Breakpoints

| Range | Target | Behavior |
|---|---|---|
| >=1024px | Desktop | Current layouts, unchanged |
| 768-1023px | Tablet | Sidebar collapses to an icon-only rail (no labels); content padding drops to 24px; toolbar stays one row if it fits, search width may shrink to ~240px |
| <768px | Mobile | Full mobile pattern described below |

### Navigation

- Sidebar is replaced below 768px by a **top app bar**: logo mark + hamburger icon (left) + avatar (right), fixed height 56px.
- Hamburger opens a **full-height slide-in drawer** reusing the existing sidebar's nav list (same items, badges, and order) rather than building a second nav component — this keeps Dashboard/Roster/Staff/Planners/Account/Settings/Sign out consistent between breakpoints.
- Do not switch to a bottom tab bar unless explicitly requested later — with 6 nav items plus badges, a drawer is more consistent with the current information density than trying to compress everything into 4-5 bottom icons.
- Badge counts (e.g. Staff's red "1") carry over unchanged inside the drawer.

### PageHeader (mobile)

- H1 font size drops to ~20-22px.
- Primary action button (e.g. "Create roster"): if the label + icon no longer fits comfortably next to the H1, collapse to an icon-only button in the header, or promote it to a fixed bottom-right floating action button (FAB). Pick one pattern and use it for every page with a primary action — don't mix. **This is a different control from the Toolbar FAB below** — a page could in principle have both a primary-action FAB (e.g. "Create roster") and the Toolbar FAB (search/filter/legend/more); if that ever collides on one page, resolve it explicitly rather than merging the two into one button that does unrelated things.

### Breadcrumb (mobile)

- Same rules as desktop (§4) — only show when it adds information tabs/nav don't already provide. Truncate long labels with ellipsis rather than wrapping.

### Tabs (mobile)

- Convert to a horizontally scrollable, non-wrapping tab strip (e.g. All Staff / Pending Approvals / User Requests). Never wrap tabs onto a second line.

### Toolbar (mobile) — superseded, see Toolbar FAB below

~~Search input becomes full-width on its own row. Sort and Filter collapse into a single "Filters" button below the search row, which opens a bottom sheet.~~ This sticky-top pattern is being replaced page by page by the **Toolbar FAB** (`src/components/FloatingActionMenu.jsx`): a single bottom-right expanding trigger (⊕ → ✕) that reveals Search / Filter / Legend / More as individual round icon buttons, instead of a permanent search row + kebab competing for header space. Rollout: Weekends → Roster → Staff (tracked outside this doc). A page not yet migrated still uses the pattern described immediately below until it is.

**Toolbar FAB** — `FloatingActionMenu`, mobile only (`md:` and up unaffected):
- Fixed bottom-right, above the bottom nav bar and clear of `env(safe-area-inset-*)`.
- Tapping the FAB expands a vertical stack of up to 7 round icon buttons (bottom-to-top, i.e. nearest the FAB first: primary action, Search, Sort, Filter, Legend, More, View — each optional per page except Search). The order is fixed: a page that omits one closes the gap rather than shuffling the rest, so a given control never changes position between pages.
- The stack reveals one button at a time: each scales 0→1 and fades in over 125ms on an overshoot curve, and the next starts only once the previous has finished. Closing is faster (75ms, no overshoot) and runs reversed, so the stack unwinds back into the FAB rather than replaying the opening order. Timings follow [nambicompany/expandable-fab](https://github.com/nambicompany/expandable-fab)'s own defaults, the Android widget this pattern is modelled on. Respects `prefers-reduced-motion` (all appear at once). Collapsed buttons stay in the DOM so they can animate, so they're held inert (`aria-hidden`, out of the tab order, no pointer events) rather than merely invisible.
- **Sort** gets its own trigger and its own sheet here, unlike the inline mobile Toolbar (which merges sort into the one "Filters" sheet because it only has room for one button). With a whole stack to spend, sort is worth its own reach rather than being buried a sheet deep behind a Filter icon.
- **Primary action** is the page's own create/add button (Rotations' "Add doctor"), the same control the PageHeader (mobile) section above offers as its own bottom-right FAB. A page that wants both puts it in this stack rather than rendering two FABs into the same corner — that's the collision that section says to resolve explicitly.
- **Search** morphs the FAB into a full-width pill with an inline text field, replacing the stack — not a separate screen.
- **Filter** opens the same `MobileFiltersSheet` the old inline "Filters" button used — same sheet, new trigger, so filter behavior itself is unchanged.
- **Legend** and **More** are thin wrappers around the existing `LegendSheet` / `PageActionsMenu` — same bottom-sheet look those already have everywhere else in the app, not a new visual language.
- **View** (Roster's List/Grid): a single icon that cycles through view options — a deliberate simplification from the two-segment `ViewToggle`, since a segmented control doesn't fit a single-icon FAB slot.
- Landscape: the stack opens sideways (left of the FAB) instead of upward, since a landscape phone rarely has 5×44px of headroom to spare above the nav bar.
- A page with its own bottom-fixed element (Staff's `BulkActionBar` during bulk selection) hides the FAB via its `hidden` prop rather than letting the two overlap.

Old inline behavior for reference (still applies to any page not yet migrated): Sort and Filter collapsed into a single "Filters" button below a full-width search row, opening the same bottom sheet the FAB's Filter action now opens.

### List rows (mobile)

- Variant A (identity rows, e.g. Staff): stack avatar + name + role tag on the first line, meta subtext on the line below. Replace the 2-3 separate inline action icons with a single overflow (kebab) menu, or support swipe-to-approve/swipe-to-reject gestures if the codebase already has a swipe-action pattern — do not cram 3 icon buttons into a narrow row.
- Variant B (record rows, e.g. Roster): title + subtitle already stack vertically, so this variant mostly just needs full-width rows; if the status pill no longer fits beside the title on very narrow screens, drop it onto its own line below the title rather than truncating it.
- Row minimum height increases to accommodate a 44x44px minimum touch target per interactive element (checkbox, action icon, chevron) — this applies to every tappable element app-wide, not just list rows.

### Bulk selection & bulk action bar (mobile)

- Hide row checkboxes by default; add a "Select" toggle in the toolbar/header that reveals them (avoids cluttering already-tight rows).
- When items are selected, the bulk action bar (§8) becomes a **sticky bar fixed to the bottom of the viewport** (thumb-reachable) instead of replacing the section label inline.

### Section labels & grouped lists (mobile)

- Same styling as desktop (§6, §10). If a page has many groups/rows, make each section collapsible (accordion) to manage scroll length — optional, only add if a page's mobile scroll becomes unreasonably long.

### Forms / modals (mobile)

- Centered 520px modals (§11) become **full-screen sheets** below 768px: header with title + close (×), scrollable body, and a sticky footer with Cancel/Primary buttons — never show a small centered dialog on a phone-width screen.

### Master-detail panel (mobile)

- The optional split-pane pattern in §12 has no room on mobile. Below 768px it always collapses to single-column: tapping a row navigates to a full-screen detail view with a back button, regardless of what happens on desktop.

### Typography & spacing scale (mobile)

- Content padding: 32px (desktop) -> 24px (tablet) -> 16px (mobile).
- Body text stays 14-16px (don't shrink below 14px for legibility).
- All touch targets >=44x44px (iOS HIG / Material guidance), including checkboxes, tag chips if tappable, and chevrons.

---

## Quick build checklist

Status as of the Phase 3–5 build-out (see "Implementation notes" above and the PR history for the reasoning behind each deviation).

- [x] Extract `PageHeader`, `Breadcrumb`, `Toolbar`, `SectionLabel`, `ListRow`, `Tag`, `BulkActionBar` as shared components — plus `Modal` and `SlideOverPanel`, not originally listed but built the same pass (`src/components/`)
- [x] Move spacing/color/radius/typography values into the token file — via `tailwind.config.js`, not a separate CSS-variable file (see "Implementation notes")
- [x] Add missing H1s to Account and Staff
- [x] Remove redundant/incorrect breadcrumbs (Staff's "← All staff" on Pending Approvals/User Requests). Account's back-link was kept — it's dynamic ("back to wherever you came from"), not the hardcoded "← Staff" the spec assumed
- [x] Standardize search input to 320px with descriptive placeholders — Staff's Pending/Requests toolbars, Roster's Active/Archive/Bin toolbars, and Staff's All Staff grid's own search. Placeholders describe what's searched everywhere
- [x] Hide Clear button until a filter/search is active — everywhere it appears, including the All Staff grid's previously-always-visible one
- [x] Split role-tag and status-tag color palettes — role tags (`Tag variant="role"`) now always neutral; status tags (`Tag variant="status"`) keep the semantic success/warning/danger palette. Fixed on Staff's Pending Approvals/User Requests rows, which were on the wrong (green/success) palette
- [x] Audit every `˅` vs `>` usage against the rule in §7/§10 — audited on Account; already correct (SectionRow=chevron/expand, ContactRow=pencil/inline-edit). No bug found to fix
- [x] Add Sort to Roster
- [x] Decide on master-detail panel vs. full navigation — already implemented for Account/Pending Approval review (`SlideOverPanel`, extracted from two near-duplicate copies); Roster still fully navigates. Left as-is — adopting it for Roster is real state/routing work, flagged as separate scope in Phase 2, not attempted here
- [x] Define breakpoints (1024px / 768px) in the token file — `tailwind.config.js`'s `screens`, matching Tailwind's own `md`/`lg` defaults
- [ ] Build mobile top app bar + nav drawer — **not built**. The app already ships a working bottom tab bar (badges, active states) on every page below 768px; replacing it with a drawer was confirmed out of scope (a primary-navigation change for every mobile user, not a layout standardization). The tablet icon-only sidebar rail (768–1023px) was built instead, since that's additive rather than a replacement
- [x] Make tabs horizontally scrollable on mobile — already true of the shared `PageTabs` template these pages use
- [x] Collapse Sort/Filter into a single mobile "Filters" bottom sheet — `Toolbar`'s mobile variant
- [x] Convert list row actions to overflow menu on mobile — `ListRow`'s `RowActions`, verified in a real render (kebab → Approve/Reject menu)
- [x] Make bulk action bar sticky-bottom on mobile — `BulkActionBar`. Roster's per-group bulk-select header was deliberately kept as its own inline swap rather than this component — Active has two independently-selectable lists (Drafts + Published) at once, and two sticky-bottom bars would collide
- [x] Convert modals to full-screen sheets below 768px — `Modal`, verified in a real render
- [x] Ensure all interactive elements meet 44x44px touch target minimum — applied in `ListRow`'s mobile checkbox/kebab and `Toolbar`'s mobile sheet controls

**Deferred / explicitly out of scope:**
- Phone verification badge (Account) — no `phone_verified` field or verification flow exists anywhere in the codebase; this needs a real feature built first, a badge with nothing true to show would be misleading UI.
- Roster-as-card-grid (§14) — optional per the spec; Roster's content width was already capped (`max-w-2xl`) before this pass, so the "sparse" problem the spec described didn't reproduce as-is.
- Dashboard-as-landing-page and the "needs attention" badge language beyond Staff (§14) — optional structural upgrades, not part of the three named pages.
- Mobile top app bar + nav drawer — see above.
