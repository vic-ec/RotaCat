"""Build the auth hero's dark-theme mascot asset.

Supersedes cutout-dark-mascot.py and dehalo-dark-mascot.py, which each did
half of this against a different source.

Input is the opaque render rather than the artist's transparent export. The
export's own background removal took the cat with it in places — the
abdomen keyed out to alpha 19, and the undersides of the paws and the tail
went with the contact shadow, which is what left chunks missing along the
bottom. The opaque render still has all of it, and the two are pixel
aligned (mean RGB difference 1.33 where the export is opaque), so nothing
is lost by working from the original.

Three problems, three answers:

  * The backdrop is a smooth gradient (luminance 14-33), and parts of the
    cat are darker than it — the shadowed abdomen is rgb(9,14,22) against
    rgb(7,16,31). Colour cannot separate those. Geometry can: keyed below
    the backdrop's ceiling, the abdomen is enclosed by the legs and haunch
    rather than open to the frame, so filling holes restores it. Above 44
    the pocket joins the outside and the abdomen is lost.
  * The plates are separated by seam lines as dark as the backdrop, and
    where one runs out to the silhouette's edge it opens a slot through the
    body. Closing seals those, and only ever adds, so the whiskers survive.
  * A bloom rings the head, firming up against the jaw into a lobe that is
    opaque and bright enough to pass for lit plating. Only its colour gives
    it away: strongly cyan, where the cat's grey-blue never is. The same
    test catches the darker cyan in the eyes, so connectivity decides —
    the lobe opens onto the frame, the eyes are walled in.

Then the contact shadow goes back. The render had one and the cut removes
it with the rest of the backdrop, which left the cat floating. It is
rebuilt from the silhouette's own base so it follows the real footprint —
paws forward, tail sweeping right — rather than sitting under it as a
generic ellipse.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'src/assets/rotaCat-full-body-mascot-dark-theme.png'
DST = 'src/assets/RotaCat-full-body-mascot-dark-transparentBG-dehaloed.png'

BACKDROP_LUM = 36      # backdrop tops out at 33; the abdomen pocket opens at 44
WARM = -6
SEAM_CLOSE = 6
BLOOM_LUM = 85         # the jaw lobe reaches 64
BLOOM_CYAN = 45        # the cat's grey-blue tops out near 40; the lobe averages 104
FEATHER = 0.8

# Contact shadow. Deep enough to read on the panel without becoming a black
# smear, and spread wider than it is tall, as a shadow on a floor is.
SHADOW_RGB = (4, 13, 19)
SHADOW_PEAK = 0.62
SHADOW_RISE, SHADOW_DROP = 10, 28
SHADOW_BLUR = (18, 30)   # (y, x) sigma

S3 = np.ones((3, 3), bool)


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def _edge_component(mask):
    lab, _ = ndimage.label(mask, structure=S3)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return np.isin(lab, edge[edge != 0])


rgb = np.array(Image.open(SRC).convert('RGB')).astype(np.float32)
lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
blueness = rgb[:, :, 2] - rgb[:, :, 0]

silhouette = ndimage.binary_fill_holes(
    ~_edge_component((lum < BACKDROP_LUM) & (blueness > WARM))
)
silhouette = ndimage.binary_fill_holes(
    ndimage.binary_closing(silhouette, structure=_disk(SEAM_CLOSE))
)

bloom = (lum < BLOOM_LUM) & (blueness > BLOOM_CYAN)
lab, _ = ndimage.label(bloom | ~silhouette, structure=S3)
edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
silhouette &= ~(bloom & np.isin(lab, edge[edge != 0]))
silhouette = ndimage.binary_fill_holes(silhouette)

cat_a = np.clip(ndimage.gaussian_filter(silhouette.astype(np.float32), FEATHER), 0, 1)

# --- contact shadow, traced from the base of the silhouette ----------------
solid = cat_a > 0.5
seed = np.zeros_like(cat_a)
H = solid.shape[0]
for x in np.where(solid.any(axis=0))[0]:
    low = np.where(solid[:, x])[0].max()
    seed[max(0, low - SHADOW_RISE):min(H, low + SHADOW_DROP), x] = 1.0
shadow_a = ndimage.gaussian_filter(seed, SHADOW_BLUR)
shadow_a = np.clip(shadow_a / shadow_a.max() * SHADOW_PEAK, 0, 1)

# The cat sits on top of it, so this is a normal source-over composite —
# not a max(), which would leave the shadow tinting the cat's own edge.
out_a = cat_a + shadow_a * (1 - cat_a)
shadow_rgb = np.array(SHADOW_RGB, dtype=np.float32)
weighted = rgb * cat_a[..., None] + shadow_rgb * (shadow_a * (1 - cat_a))[..., None]
out_rgb = np.divide(weighted, np.maximum(out_a, 1e-6)[..., None])

out = np.dstack([np.clip(out_rgb, 0, 255), out_a * 255]).astype(np.uint8)
Image.fromarray(out, 'RGBA').save(DST)

a = out[:, :, 3]
for name, (y, x) in {'abdomen': (1255, 425), 'toe gap': (1545, 187), 'paw underside': (1580, 150),
                     'tail lower edge': (1690, 430), 'inner ear': (215, 560), 'eye': (370, 400),
                     'collar': (640, 240)}.items():
    assert a[y, x] == 255, '%s is not solid (alpha %d)' % (name, a[y, x])
for name, (y, x) in {'bloom lobe': (500, 470), 'bloom at jaw': (470, 560)}.items():
    assert a[y, x] == 0, '%s survived (alpha %d)' % (name, a[y, x])
assert a[1745, 470] > 40, 'no contact shadow under the paws (alpha %d)' % a[1745, 470]
assert a[80, 60] == 0, 'shadow or bloom reached the top corner'

print('wrote %s' % DST)
print('cat solid %.1f%% of frame, shadow peaks at alpha %d'
      % (100 * (cat_a > 0.5).mean(), int(shadow_a.max() * 255)))
