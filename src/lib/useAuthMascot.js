import { useTheme } from '../context/ThemeContext'
import { DARK_THEME } from './themes'
import mascotLight from '../assets/rotacat-full-body-mascot-cutout.png'
import mascotDark from '../assets/RotaCat-full-body-mascot-dark-transparentBG-dehaloed.png'

// The auth mascot is the one image in the app that cannot simply be recoloured
// by the theme: it is a rendered cut-out, not an icon. The light artwork is a
// cream-and-ginger cat lit for a white panel — on the dark theme's ground it
// reads as a bright object floating on black rather than as part of the
// screen. The dark artwork is a separate colourway (steel and copper, lit for
// a dark ground) with its edges already de-haloed, so it composites cleanly.
//
// Shared by AuthHero and MobileAuthHero so the two can never disagree about
// which cat is showing.
export function useAuthMascot() {
  const { theme } = useTheme()
  return theme === DARK_THEME ? mascotDark : mascotLight
}
