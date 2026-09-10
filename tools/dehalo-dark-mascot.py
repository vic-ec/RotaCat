"""Make the dark mascot's transparent export usable on the auth hero.

The export needs two things doing to it, and they pull in opposite
directions, which is why they are one script rather than two.

1. The cat has to be OPAQUE. The export's own background removal keyed out
   the cat's darkest areas along with the backdrop: the abdomen sits at
   alpha 10-19 and parts of the inner ears are little better. The hero
   draws its pulsing roster band behind the mascot, so anything short of
   solid lets the band show through the cat.

2. The backdrop's bloom has to go. A soft navy glow survives around the
   head, and against the jaw it firms up into a saturated cyan lobe that is
   fully opaque — 19,000px of it — which is what stayed visible to the
   right of the neck after the first attempt: it is bright enough (lum 64)
   to pass for lit plating, so a brightness rule keeps it.

Colour is what separates that lobe from the cat: it is dark-ish and
strongly cyan, and the cat's own grey-blue never gets past about 40 on
blue-minus-red where the lobe averages 104. But the same test also catches
the darker cyan inside the eyes, so it cannot be applied on colour alone.
Connectivity settles it — the lobe opens onto the frame, the eyes are
enclosed by plating.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'src/assets/RotaCat-full-body-mascot-dark-transparentBG.png'
DST = 'src/assets/RotaCat-full-body-mascot-dark-transparentBG-dehaloed.png'

SOLID = 200        # the cat's lit surfaces; its shadows are recovered by enclosure
BLOOM_LUM = 85     # the jaw lobe reaches 64, so a lower bar leaves it behind
BLOOM_CYAN = 45    # the cat's grey-blue tops out near 40; the bloom averages 104
CLOSE = 3
FEATHER = 0.8

S3 = np.ones((3, 3), bool)


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


src = np.array(Image.open(SRC).convert('RGBA'))
alpha = src[:, :, 3]
rgb = src[:, :, :3].astype(np.float32)
lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
blueness = rgb[:, :, 2] - rgb[:, :, 0]

bloom = (lum < BLOOM_LUM) & (blueness > BLOOM_CYAN)

solid = (alpha >= SOLID) & ~bloom
silhouette = ndimage.binary_fill_holes(ndimage.binary_closing(solid, structure=_disk(CLOSE)))

# Bloom that opens onto the frame is backdrop and goes; bloom walled in by
# the cat is the eyes, and stays. Growing the outside through bloom-coloured
# pixels only is what tells the two apart.
outside = ~silhouette
open_bloom = ndimage.label(bloom | outside, structure=S3)[0]
at_edge = np.unique(np.concatenate([open_bloom[0], open_bloom[-1],
                                    open_bloom[:, 0], open_bloom[:, -1]]))
silhouette &= ~(bloom & np.isin(open_bloom, at_edge[at_edge != 0]))
silhouette = ndimage.binary_fill_holes(silhouette)

# Solid through and through, with a pixel of feather so the edge is not
# stair-stepped. The colour data is untouched throughout — only alpha is
# rewritten.
out = src.copy()
out[:, :, 3] = np.clip(ndimage.gaussian_filter(silhouette.astype(np.float32), FEATHER), 0, 1) * 255
Image.fromarray(out, 'RGBA').save(DST)

a = out[:, :, 3]
# The places the band was showing through. These are body, so they must be
# fully solid — no "nearly".
for name, (y, x) in {'abdomen': (1255, 425), 'abdomen 2': (1300, 400), 'left ear inner': (210, 300),
                     'right ear inner': (215, 560), 'eye': (370, 400), 'collar': (640, 240)}.items():
    assert a[y, x] == 255, '%s is not opaque (alpha %d)' % (name, a[y, x])

# A whisker is a two-pixel line, so the feather that keeps the silhouette's
# edge from stair-stepping necessarily takes the top off it. 250 of 255 is
# the cost of not having a jagged cat.
assert a[560, 120] >= 240, 'whisker faded to %d' % a[560, 120]
for name, (y, x) in {'halo lobe': (500, 470), 'halo at jaw': (470, 560),
                     'halo behind head': (300, 700)}.items():
    assert a[y, x] == 0, '%s survived (alpha %d)' % (name, a[y, x])

assert np.array_equal(src[:, :, :3], out[:, :, :3]), 'RGB changed'
print('wrote %s' % DST)
print('opaque %.1f%% of frame; every checked point of the cat is solid and every halo probe is clear'
      % (100 * (a == 255).mean()))
