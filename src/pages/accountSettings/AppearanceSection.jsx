import DetailInfoButton from '../../components/DetailInfoButton'
import { AVATAR_COLOR_PALETTE } from '../../lib/color'
import { useSwatch } from '../../lib/useSwatch'
import SectionRow from './SectionRow'
import { PaletteIcon } from './icons'

// Appearance: your roster colour (your own account). Moved out of AccountSettingsPage as it was.
export default function AppearanceSection({
  profile, appearancePreviewColor, pickColorSwatch, colorForm, saveAppearance, colorSaving, isColorDirty,
  colorJustSaved, cancelAppearance, surpriseMe, surprising, colorMsg,
}) {
  const swatch = useSwatch()

  return (
    <SectionRow icon={<PaletteIcon className="h-5 w-5" />} title="Appearance">
  {/* The roster's own assignment chip rather than the avatar: this
      colour is worn almost entirely on a roster, so the preview is
      the thing itself — the same rounded box with the colour as a
      left rail that RosterGridPage's DoctorChip draws, at the size
      it renders there. */}
  <div className="mb-5 flex items-center gap-4">
    <span
      className="flex items-center whitespace-nowrap rounded-sm border border-slate-line border-l-[3px] bg-canvas-raised px-1.5 py-0.5 text-xs font-medium text-ink"
      style={{ borderLeftColor: swatch.stroke(appearancePreviewColor) }}
    >
      {profile.surname}
    </span>
    <div className="flex items-center gap-1.5">
      <p className="text-sm font-medium text-ink">Profile colour</p>
      <DetailInfoButton
        label="About this preview"
        text="This is how your name will appear on the roster."
      />
    </div>
  </div>

  <div className="mb-4">
    <label className="label-text">Colour</label>
    <div className="flex flex-wrap gap-2">
      {AVATAR_COLOR_PALETTE.map(hex => (
        <button
          key={hex}
          type="button"
          onClick={() => pickColorSwatch(hex)}
          aria-label={`Choose ${hex}`}
          className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-canvas-raised transition-transform hover:scale-105 ${
            colorForm.colorCode === hex ? 'ring-ink' : 'ring-transparent'
          }`}
          style={swatch.fill(hex)}
        />
      ))}
    </div>
  </div>

  <div className="flex flex-wrap items-center gap-3">
    <button type="button" onClick={saveAppearance} disabled={colorSaving || !isColorDirty} className="btn-primary">
      {colorSaving ? 'Saving…' : colorJustSaved ? 'Saved.' : 'Update'}
    </button>
    <button type="button" onClick={cancelAppearance} disabled={!isColorDirty || colorSaving} className="btn-secondary">
      Cancel
    </button>
    <button type="button" onClick={surpriseMe} disabled={surprising} className="btn-secondary">
      {surprising ? 'Picking…' : 'Surprise me!'}
    </button>
    {colorMsg && (
      <span className={`text-xs font-medium ${colorMsg.type === 'error' ? 'text-flagRed' : 'text-flagAmber'}`}>
        {colorMsg.text}
      </span>
    )}
  </div>
    </SectionRow>
  )
}
