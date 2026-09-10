"""Cut the dark-theme RotaCat mascot out of its navy backdrop.

The obvious approach — key out the backdrop — does not work here, for three
reasons found the hard way:

  * The backdrop is a smooth radial gradient (luminance 14-33), not a flat
    colour, so there is no single colour to key.
  * The cat is drawn with dark navy seam lines between its plates, as dark
    and as blue as the backdrop. Keying them out opens slots straight
    through the body, which on the auth hero would let the roster band
    pulse through the cat's chest.
  * A soft glow rings the silhouette. Any threshold loose enough to remove
    it is loose enough to eat the cat's own shadowed plating.

So this works the other way round: find the *cat* rather than the
backdrop. A pixel belongs to the cat if it is bright enough to be lit
plating, or warm enough to be copper or the rose collar — neither of which
the backdrop or its glow ever is. That leaves the seam lines and the inner
ears out, and they come back as enclosed holes, which is exactly what they
are.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'src/assets/rotaCat-full-body-mascot-dark-theme.png'
DST = 'src/assets/rotaCat-full-body-mascot-dark-theme-cutout.png'

CAT_LUM = 70    # lit plating starts ~104; the backdrop tops out at 33 and
                # its glow well below this
WARM = -6       # blue-minus-red; the copper and the collar are warm, the
                # backdrop and glow never are
SEAM_CLOSE = 6  # px radius — seals the seam lines between plates
FEATHER = 0.9   # px

S8 = np.ones((3, 3), bool)


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def _touches_border(mask):
    lab, _ = ndimage.label(mask, structure=S8)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return np.isin(lab, edge[edge != 0])


rgb = np.array(Image.open(SRC).convert('RGB')).astype(np.float32)
lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
warmth = rgb[:, :, 2] - rgb[:, :, 0]

cat = (lum > CAT_LUM) | (warmth < WARM)

# Close the seam lines, then fill what they enclose: the seams, the pupils,
# the dark inner ears. Closing only ever adds, so the whiskers — one or two
# pixels wide — survive it, where an erosion would have cost them.
subject = ndimage.binary_fill_holes(ndimage.binary_closing(cat, structure=_disk(SEAM_CLOSE)))

# Anything still open to the frame's edge is backdrop, however bright the
# glow made it.
subject = ndimage.binary_fill_holes(~_touches_border(~subject))

# One pixel in, so no rim of backdrop rides along as a fringe on a ground
# that isn't navy.
subject = ndimage.binary_erosion(subject, structure=S8)

alpha = np.clip(ndimage.gaussian_filter(subject.astype(np.float32), FEATHER), 0, 1)
Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA').save(DST)

ys, xs = np.where(alpha > 0.5)
print('wrote %s' % DST)
print('opaque %.1f%% of frame; bbox x[%d:%d] y[%d:%d] of %dx%d'
      % (100 * (alpha > 0.5).mean(), xs.min(), xs.max(), ys.min(), ys.max(), rgb.shape[1], rgb.shape[0]))
