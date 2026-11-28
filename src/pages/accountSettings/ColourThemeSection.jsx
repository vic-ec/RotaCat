import { CircleCheck, Contrast } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import SectionRow from './SectionRow'

// Colour theme (your own account; see the comment where AccountSettingsPage
// renders it). Moved out of AccountSettingsPage as it was.
export default function ColourThemeSection() {
  const { choice: themeChoice, setTheme, choices: themeChoices } = useTheme()

  return (
    <SectionRow icon={<Contrast className="h-5 w-5" />} title="Colour theme">
  <div className="flex flex-col gap-2">
    {themeChoices.map(t => {
      // Selected by CHOICE, not by applied theme — on "Match device"
      // the resolved palette is also in this list, and keying off the
      // applied theme would light up two tiles at once.
      const selected = themeChoice === t.id
      return (
        <button
          key={t.id}
          type="button"
          onClick={() => setTheme(t.id)}
          aria-pressed={selected}
          className={`flex items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
            selected
              ? 'border-accent bg-accent-tint'
              : 'border-slate-line bg-canvas-raised hover:bg-canvas-sunken active:bg-canvas-sunken'
          }`}
        >
          <span className="flex flex-shrink-0 overflow-hidden rounded border border-slate-line">
            {t.swatch.map(c => (
              <span key={c} className="h-6 w-4" style={{ backgroundColor: c }} />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t.label}</span>
          {selected && <CircleCheck className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />}
        </button>
      )
    })}
  </div>
    </SectionRow>
  )
}
