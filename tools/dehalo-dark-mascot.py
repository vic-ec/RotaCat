"""Strip the leftover backdrop halo from the transparent dark mascot.

The supplied cut-out is clean on the cat — plating, whiskers and collar are
fully opaque — but a soft bloom of the original navy backdrop survives in
the alpha around the head and neck, reaching alpha 174 well clear of the
silhouette. On the dark panel it is invisible; against anything else it is
a grey smudge behind the shoulder.

Nothing here touches the cat. RGB is copied through byte for byte, and
every pixel inside the silhouette keeps the alpha it arrived with — the
eyes and inner ears included, which sit a few levels below opaque in the
source and stay exactly there. Only alpha outside the silhouette is
cleared.

Two things the silhouette cannot be found by:

  * Alpha alone. The bloom has a dense core against the cheek that reaches
    full opacity; taken for cat, it gets sealed in by fill_holes as a hard
    teal blob.
  * Colour alone, past a point. The cat's shadowed plating is grey-blue and
    not much brighter than the bloom. Raising the brightness bar to 90 does
    clear the last of the bloom — and takes the chest, the front legs and
    the belly with it. 55 is the setting that holds the body.

What is left after that is a narrow band right against the jaw, where the
bloom blends into the cat's own cyan rim light. The band's colour is the
one thing that separates it: it is strongly cyan (blue minus red above 55)
where the cat's grey-blue never gets past about 40, so the last step
clears that and only that, and only where it is reachable from outside.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'src/assets/RotaCat-full-body-mascot-dark-transparentBG.png'
DST = 'src/assets/RotaCat-full-body-mascot-dark-transparentBG-dehaloed.png'

SOLID = 250     # the cat's own pixels are 245-255
CAT_LUM = 55    # see the note above on why this is not higher
WARM = -6       # blue-minus-red: copper and collar are warm, the backdrop never is
CLOSE = 3       # px, bridges the anti-aliased gaps in the solid mask
RIM = 2         # px of the cat's own anti-aliased edge to preserve
BLOOM_CYAN = 55 # blue-minus-red above this, and dark, is rim bloom not cat
BLOOM_REACH = 60

S3 = np.ones((3, 3), bool)

src = np.array(Image.open(SRC).convert('RGBA'))
alpha = src[:, :, 3]
rgb = src[:, :, :3].astype(np.float32)
lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
blueness = rgb[:, :, 2] - rgb[:, :, 0]

solid = (alpha >= SOLID) & ((lum > CAT_LUM) | (blueness < WARM))
silhouette = ndimage.binary_fill_holes(
    ndimage.binary_closing(solid, structure=np.ones((2 * CLOSE + 1,) * 2, bool))
)
# The cat's outline is anti-aliased, so a couple of pixels of sub-opaque edge
# belong to it; cutting flush to the solid mask leaves a hard, jagged edge.
keep = ndimage.binary_dilation(silhouette, structure=np.ones((2 * RIM + 1,) * 2, bool))
out_alpha = np.where(keep, alpha, 0)

bloom = (lum < CAT_LUM) & (blueness > BLOOM_CYAN) & (out_alpha > 0)
reachable = ndimage.binary_dilation(~keep, structure=S3, mask=(bloom | ~keep),
                                    iterations=BLOOM_REACH)
out_alpha = np.where(bloom & reachable, 0, out_alpha)

out = src.copy()
out[:, :, 3] = out_alpha
Image.fromarray(out, 'RGBA').save(DST)

# The promise of this script, asserted rather than hoped for: nothing that is
# opaque and unambiguously the cat may lose its alpha.
definitely_cat = (alpha >= SOLID) & ((lum > 100) | (blueness < -30))
assert not (definitely_cat & (out_alpha == 0)).any(), 'cat pixels were cleared'
assert np.array_equal(src[:, :, :3], out[:, :, :3]), 'RGB changed'
assert np.array_equal(alpha[keep & ~bloom], out_alpha[keep & ~bloom]), 'alpha changed inside the cat'

cleared = (alpha > 0) & (out_alpha == 0)
print('wrote %s' % DST)
print('cleared %d px (%.2f%% of frame), max alpha %d, mean rgb %s — all backdrop bloom'
      % (cleared.sum(), 100 * cleared.mean(), alpha[cleared].max(),
         rgb[cleared].mean(axis=0).round(1)))
