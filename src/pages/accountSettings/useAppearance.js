import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { NEUTRAL_AVATAR_COLOR, randomAvatarColor } from '../../lib/color'
import { flashSaved } from './accountSettingsHelpers'

// Your roster colour: picking, Surprise me!, the clash check, save and
// cancel. Moved out of AccountSettingsPage as it was.
export function useAppearance({ user, profile, refreshProfile }) {
  // Appearance: colour + pattern (own account only)
  const [colorForm, setColorForm] = useState({ colorCode: NEUTRAL_AVATAR_COLOR })
  const [colorSaving, setColorSaving] = useState(false)
  const [colorJustSaved, setColorJustSaved] = useState(false)
  const [surprising, setSurprising] = useState(false)
  const [colorMsg, setColorMsg] = useState(null)

  // ── Appearance: colour (own account only) ────────────────────
  // Checks whether another *active* profile already wears this colour — an
  // inactive profile's colour is implicitly "recycled" since it's excluded
  // here. Manual picks just get a heads-up (cosmetic, not blocking); Surprise
  // me actively avoids collisions instead since there's no cost to retrying.
  async function checkColorTaken(colorCode) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .eq('color_code', colorCode)
      .neq('id', user.id)
    return (data || []).length > 0
  }

  // Picks only stage locally — nothing is written until Update is clicked.
  // Each pick still runs a read-only collision preview so the warning stays
  // current, but mashing Surprise me! no longer fires a wave of concurrent
  // writes that can race/slow down/error.
  async function previewColor(colorCode) {
    const taken = await checkColorTaken(colorCode)
    setColorMsg(taken ? { type: 'warning', text: 'Another active staff member already has this colour.' } : null)
  }
  function pickColorSwatch(hex) {
    setColorForm({ colorCode: hex })
    previewColor(hex)
  }
  async function surpriseMe() {
    if (surprising) return
    setSurprising(true)
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('id, color_code')
      .eq('is_active', true)
    const taken = new Set((activeProfiles || []).filter(p => p.id !== user.id).map(p => p.color_code))
    let colorCode, attempts = 0
    do {
      colorCode = randomAvatarColor()
      attempts += 1
    } while (taken.has(colorCode) && attempts < 30)
    setColorForm({ colorCode })
    setSurprising(false)
    previewColor(colorCode)
  }
  async function saveAppearance() {
    setColorSaving(true)
    setColorMsg(null)
    // Patterns are no longer chosen here; saving a colour also clears any
    // pattern the profile still carries so the roster shows plain colour.
    const { error } = await supabase
      .from('profiles')
      .update({ color_code: colorForm.colorCode, pattern_type: null })
      .eq('id', user.id)
    setColorSaving(false)
    if (error) {
      setColorMsg({ type: 'error', text: error.message })
      return
    }
    refreshProfile()
    flashSaved(setColorJustSaved)
    const taken = await checkColorTaken(colorForm.colorCode)
    if (taken) {
      setColorMsg({ type: 'warning', text: 'Another active staff member already has this colour.' })
    }
  }
  // Discards any unsaved local picks, reverting back to what's actually saved.
  function cancelAppearance() {
    setColorForm({ colorCode: profile.color_code || NEUTRAL_AVATAR_COLOR })
    setColorMsg(null)
  }
  const isColorDirty = colorForm.colorCode !== (profile?.color_code || NEUTRAL_AVATAR_COLOR)
  // Same fallback the roster grid's own chip uses when a doctor has no
  // colour set, so the preview doesn't show one colour and the roster
  // another.
  const appearancePreviewColor = colorForm.colorCode || '#4A90D9'

  return {
    colorForm, setColorForm, colorSaving, colorJustSaved, surprising, colorMsg, pickColorSwatch, surpriseMe,
    saveAppearance, cancelAppearance, isColorDirty, appearancePreviewColor,
  }
}
