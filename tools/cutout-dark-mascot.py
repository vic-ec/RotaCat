"""Cut the dark-theme RotaCat mascot off its navy backdrop.

The auth hero draws its roster band in the DOM behind the mascot so the
pills can pulse, so the asset has to be transparent — the light-theme
mascot is a cut-out for the same reason.

What makes this image awkward is that parts of the cat are darker than the
backdrop. The belly in shadow is rgb(9,14,22) against a backdrop of
rgb(7,16,31): no colour rule can tell them apart, and a threshold loose
enough to remove the backdrop's glow chews the abdomen, the toes and the
underside of the tail straight out of the silhouette.

Geometry is what saves it. Keyed tightly — below the backdrop's own
ceiling of 33 rather than anywhere near the cat's shadows — the shadowed
belly is *enclosed* by the legs and haunch rather than open to the frame's
edge, so filling holes restores it. That only holds under about 44: above
that the pocket joins the outside and the abdomen is lost.

The cost of keying this tightly is that the backdrop's glow, which is
brighter than the threshold, stays as a soft halo around the silhouette.
That is deliberate. This asset's whole job is to sit on the dark panel,
where the halo is invisible against it; every attempt to trim it also took
the whiskers with it (~1000px above luminance 70), which is the worse
trade by far.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'src/assets/rotaCat-full-body-mascot-dark-theme.png'
DST = 'src/assets/rotaCat-full-body-mascot-dark-theme-cutout.png'

# The backdrop measures 14-33 across the frame. 36 clears it; the abdomen
# pocket stops being enclosed at 44, so this sits deliberately nearer the
# floor of that window than the ceiling.
BACKDROP_LUM = 36
WARM = -6        # blue-minus-red: the copper and collar are warm, the backdrop never is
SEAM_CLOSE = 6   # px radius — the dark seam lines between the cat's plates
FEATHER = 0.9    # px

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

backdrop = _touches_border((lum < BACKDROP_LUM) & (warmth > WARM))

# Everything the backdrop does not reach is the cat — including the shadowed
# belly, which is enclosed rather than open.
subject = ndimage.binary_fill_holes(~backdrop)

# The plates are separated by seam lines as dark as the backdrop. Where one
# runs out to the silhouette's edge it opens a slot through the body, which
# on the hero would let the band pulse through the cat. Closing seals any
# intrusion narrower than 2*SEAM_CLOSE, and only ever adds — so unlike an
# erosion it cannot cost the whiskers.
subject = ndimage.binary_fill_holes(ndimage.binary_closing(subject, structure=_disk(SEAM_CLOSE)))

subject = ndimage.binary_erosion(subject, structure=S8)

alpha = np.clip(ndimage.gaussian_filter(subject.astype(np.float32), FEATHER), 0, 1)
Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA').save(DST)

# The four places a loose key destroys first — a regression check, not decoration.
for name, (y, x) in {'abdomen': (1255, 425), 'paw underside': (1580, 150),
                     'toe gap': (1545, 187), 'tail lower edge': (1690, 430)}.items():
    assert alpha[y, x] > 0.5, '%s went transparent' % name
print('wrote %s — opaque %.1f%% of frame; abdomen, toes and tail all solid'
      % (DST, 100 * (alpha > 0.5).mean()))
