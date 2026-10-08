import json, math, sys
import numpy as np
from PIL import Image
sys.path.insert(0, sys.argv[2])
from process import to_xz, LAT0, LON0

D = sys.argv[1]
core = np.load(f"{D}/core.npy")
HALF, N = 11000.0, core.shape[0]
STEP = 2 * HALF / (N - 1)

def h(x, z):
    gx = (x + HALF) / STEP; gz = (z + HALF) / STEP
    x0 = int(np.clip(math.floor(gx), 0, N - 2)); z0 = int(np.clip(math.floor(gz), 0, N - 2))
    fx, fz = gx - x0, gz - z0
    return (core[z0, x0] * (1 - fx) * (1 - fz) + core[z0, x0 + 1] * fx * (1 - fz)
            + core[z0 + 1, x0] * (1 - fx) * fz + core[z0 + 1, x0 + 1] * fx * fz)

FT = 0.3048
# (name, lat, lon, target elevation in m or None for "use DEM")
WAY = [
    ("Paradise", 46.7865, -121.7353, 5400 * FT),
    ("Panorama Point", 46.8000, -121.7300, 6800 * FT),
    ("Pebble Creek", 46.8080, -121.7295, 7200 * FT),
    ("Camp Muir", 46.8355, -121.7317, 10188 * FT),
    ("Cathedral Gap", 46.8390, -121.7265, 10400 * FT),
    ("Ingraham Flats", 46.8425, -121.7240, 11100 * FT),
    ("Disappointment Cleaver base", 46.8440, -121.7270, 11200 * FT),
    ("Top of the Cleaver", 46.8478, -121.7320, 12300 * FT),
    ("High Break", 46.8505, -121.7410, 13000 * FT),
    ("Crater Rim", 46.8519, -121.7540, 14150 * FT),
    ("Columbia Crest", 46.8529, -121.7604, 14411 * FT),
]

def snap(x, z, target, radius=500, penalty=0.05):
    best, bx, bz = 1e9, x, z
    for dx in np.arange(-radius, radius + 1, 10):
        for dz in np.arange(-radius, radius + 1, 10):
            d = math.hypot(dx, dz)
            if d > radius: continue
            e = h(x + dx, z + dz)
            score = abs(e - target) + d * penalty
            if score < best: best, bx, bz = score, x + dx, z + dz
    return bx, bz

pts = []
for name, la, lo, tgt in WAY:
    x, z = to_xz(la, lo)
    if tgt is not None and name != "Columbia Crest":
        wide = name in ("Ingraham Flats", "Top of the Cleaver", "Disappointment Cleaver base")
        x, z = snap(x, z, tgt, radius=900 if wide else 500, penalty=0.01 if wide else 0.05)
    if name == "Columbia Crest":  # the true high point within 150 m
        best = max(((h(x + dx, z + dz), x + dx, z + dz) for dx in range(-150, 151, 5) for dz in range(-150, 151, 5)))
        _, x, z = best
    e = float(h(x, z))
    pts.append({"name": name, "x": round(float(x), 1), "z": round(float(z), 1), "dem": round(e, 1),
                "target": None if tgt is None else round(tgt, 1)})
    print(f"{name:28s} x {x:8.0f} z {z:8.0f}  DEM {e:6.0f} m ({e / FT:6.0f} ft)" + ("" if tgt is None else f"  target {tgt / FT:.0f} ft"))
json.dump(pts, open(f"{D}/route.json", "w"), indent=1)

# Hillshade with the route, to check the picture looks like Rainier.
gy, gx = np.gradient(core, STEP)
az, alt = math.radians(315), math.radians(40)
slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
img = np.clip(shade, 0, 1)
rgb = np.stack([img] * 3, -1)
snow = (core > 2000) & (np.degrees(slope) < 38)
rgb[snow] = rgb[snow] * 0.35 + 0.65
rgb = (rgb * 255).astype(np.uint8)
im = Image.fromarray(rgb)
from PIL import ImageDraw
dr = ImageDraw.Draw(im)
pp = [((p["x"] + HALF) / STEP, (p["z"] + HALF) / STEP) for p in pts]
dr.line(pp, fill=(255, 90, 30), width=3)
for (px, pz), p in zip(pp, pts):
    dr.ellipse([px - 4, pz - 4, px + 4, pz + 4], fill=(255, 220, 0))
im.save(f"{D}/hillshade.png")
